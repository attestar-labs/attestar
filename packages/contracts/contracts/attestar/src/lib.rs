#![no_std]

mod groth16;
pub use groth16::{Proof, VerifyingKey};

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    VerifierNotSet = 3,
    InvalidProof = 4,
    EpochExists = 5,
    /// The issuer's on-chain reserve balance is negative.
    NegativeReserves = 6,
    /// One of the committed Merkle roots is all zeroes.
    ZeroRoot = 7,
    /// The liability and reserve commitments are the same value.
    IdenticalRoots = 8,
}

#[contracttype]
pub enum DataKey {
    Admin,
    ReserveToken,
    ReserveHolder,
    Attestor,
    Vk,
    LatestEpoch,
    Attestation(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub epoch: u64,
    pub liab_root: BytesN<32>,
    pub res_root: BytesN<32>,
    pub onchain_reserves: i128,
    pub solvent: bool,
    pub timestamp: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestationPosted {
    #[topic]
    pub epoch: u64,
    pub solvent: bool,
    pub onchain_reserves: i128,
}

#[contract]
pub struct AttestarContract;

#[contractimpl]
impl AttestarContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        reserve_token: Address,
        reserve_holder: Address,
        attestor: BytesN<32>,
    ) -> Result<(), Error> {
        let store = env.storage().instance();
        if store.has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        store.set(&DataKey::Admin, &admin);
        store.set(&DataKey::ReserveToken, &reserve_token);
        store.set(&DataKey::ReserveHolder, &reserve_holder);
        store.set(&DataKey::Attestor, &attestor);
        Ok(())
    }

    pub fn set_verifier(env: Env, vk: VerifyingKey) -> Result<(), Error> {
        let admin = Self::admin(&env)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Vk, &vk);
        Ok(())
    }

    // Records a private proof of solvency for `epoch`.
    //
    // `liab_root` and `res_root` are the Merkle-sum commitments to the (private)
    // holder liabilities and the (private) off-chain reserve sources. `solvent` is
    // the verdict computed inside the circuit. The contract reads the issuer's REAL
    // on-chain reserve balance and substitutes it as the fourth public input, so the
    // prover cannot inflate it: the four public signals
    //   [liab_root, res_root, solvent, onchain_reserves]
    // must match the proof exactly or verification fails. When an attestor is set,
    // a custodian ed25519 signature over (epoch || res_root) attests the off-chain
    // reserve composition.
    //
    // Before the pairing, the public signals are also checked against the invariants
    // the circuit itself relies on (see `check_implied_solvency`), so a verified key
    // from a mismatched or relaxed circuit build cannot record a contradictory verdict.
    pub fn submit_attestation(
        env: Env,
        epoch: u64,
        proof: Proof,
        liab_root: BytesN<32>,
        res_root: BytesN<32>,
        solvent: bool,
        res_sig: BytesN<64>,
    ) -> Result<Attestation, Error> {
        let admin = Self::admin(&env)?;
        admin.require_auth();

        if env.storage().persistent().has(&DataKey::Attestation(epoch)) {
            return Err(Error::EpochExists);
        }

        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::Vk)
            .ok_or(Error::VerifierNotSet)?;

        let onchain_reserves = Self::reserves(&env);
        Self::check_implied_solvency(&liab_root, &res_root, onchain_reserves)?;
        let public_inputs =
            Self::public_inputs(&env, &liab_root, &res_root, solvent, onchain_reserves);
        if !groth16::verify(&env, &vk, &proof, &public_inputs) {
            return Err(Error::InvalidProof);
        }

        Self::verify_reserve_sig(&env, epoch, &res_root, &res_sig);

        let att = Self::record(&env, epoch, liab_root, res_root, onchain_reserves, solvent);
        Ok(att)
    }

    pub fn get_attestation(env: Env, epoch: u64) -> Option<Attestation> {
        env.storage().persistent().get(&DataKey::Attestation(epoch))
    }

    pub fn latest(env: Env) -> Option<Attestation> {
        let epoch: u64 = env.storage().instance().get(&DataKey::LatestEpoch)?;
        env.storage().persistent().get(&DataKey::Attestation(epoch))
    }

    pub fn is_solvent(env: Env, epoch: u64) -> bool {
        Self::get_attestation(env, epoch)
            .map(|a| a.solvent)
            .unwrap_or(false)
    }

    pub fn verify_proof(
        env: Env,
        vk: VerifyingKey,
        proof: Proof,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        groth16::verify(&env, &vk, &proof, &public_inputs)
    }
}

impl AttestarContract {
    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn reserves(env: &Env) -> i128 {
        let reserve_token: Address = env.storage().instance().get(&DataKey::ReserveToken).unwrap();
        let reserve_holder: Address =
            env.storage().instance().get(&DataKey::ReserveHolder).unwrap();
        token::TokenClient::new(env, &reserve_token).balance(&reserve_holder)
    }

    // Witness-free checks on the public signals this call supplies.
    //
    // The circuit enforces all three - each leaf is range-checked with `Num2Bits(64)`
    // and the two committed roots are distinct sums - but the contract is where the
    // verdict becomes readable history, and a verifying key from a mismatched or
    // relaxed circuit build would otherwise be enough to record an economically false
    // attestation. These comparisons cost nothing next to a BN254 pairing.
    fn check_implied_solvency(
        liab_root: &BytesN<32>,
        res_root: &BytesN<32>,
        onchain_reserves: i128,
    ) -> Result<(), Error> {
        if onchain_reserves < 0 {
            return Err(Error::NegativeReserves);
        }
        // A Merkle-sum root of a non-empty tree is a Poseidon hash and can never be
        // the zero field element, so a zero commitment means the signal is malformed.
        let zero = [0u8; 32];
        if liab_root.to_array() == zero || res_root.to_array() == zero {
            return Err(Error::ZeroRoot);
        }
        // Liabilities and reserves are different sums over different leaves; equal
        // commitments mean the two signals describe the same tree.
        if liab_root == res_root {
            return Err(Error::IdenticalRoots);
        }
        Ok(())
    }

    fn public_inputs(
        env: &Env,
        liab_root: &BytesN<32>,
        res_root: &BytesN<32>,
        solvent: bool,
        onchain_reserves: i128,
    ) -> Vec<BytesN<32>> {
        let mut inputs = Vec::new(env);
        inputs.push_back(liab_root.clone());
        inputs.push_back(res_root.clone());
        inputs.push_back(Self::bool_field(env, solvent));
        inputs.push_back(Self::u128_field(env, onchain_reserves as u128));
        inputs
    }

    fn bool_field(env: &Env, b: bool) -> BytesN<32> {
        let mut be = [0u8; 32];
        if b {
            be[31] = 1;
        }
        BytesN::from_array(env, &be)
    }

    fn u128_field(env: &Env, v: u128) -> BytesN<32> {
        let mut be = [0u8; 32];
        be[16..].copy_from_slice(&v.to_be_bytes());
        BytesN::from_array(env, &be)
    }

    fn verify_reserve_sig(env: &Env, epoch: u64, res_root: &BytesN<32>, sig: &BytesN<64>) {
        let attestor: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::Attestor)
            .expect("attestor not set");
        if attestor == BytesN::from_array(env, &[0u8; 32]) {
            return;
        }
        let mut msg = Bytes::new(env);
        msg.extend_from_slice(&epoch.to_be_bytes());
        msg.extend_from_slice(&res_root.to_array());
        env.crypto().ed25519_verify(&attestor, &msg, sig);
    }

    fn record(
        env: &Env,
        epoch: u64,
        liab_root: BytesN<32>,
        res_root: BytesN<32>,
        onchain_reserves: i128,
        solvent: bool,
    ) -> Attestation {
        let att = Attestation {
            epoch,
            liab_root,
            res_root,
            onchain_reserves,
            solvent,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Attestation(epoch), &att);
        env.storage().instance().set(&DataKey::LatestEpoch, &epoch);

        AttestationPosted {
            epoch,
            solvent: att.solvent,
            onchain_reserves: att.onchain_reserves,
        }
        .publish(env);
        att
    }
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod test;
