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
    Unauthorized = 9,
    UnknownAttestor = 10,
}

#[contracttype]
pub enum DataKey {
    Admin,
    ReserveToken,
    ReserveHolder,
    Attestor,
    /// The key that was current before the most recent rotation. It stays
    /// accepted until the overlap window is closed, so a custodian that has not
    /// yet switched over can still publish valid attestations.
    PrevAttestor,
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

/// Emitted when the reserve-signature attestor is rotated. `previous` is kept
/// as the overlap key until the window is closed.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestorRotated {
    #[topic]
    pub current: BytesN<32>,
    pub previous: BytesN<32>,
}

/// Emitted when the overlap window is closed early, retiring `retired`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestorOverlapEnded {
    #[topic]
    pub retired: BytesN<32>,
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
    // reserve composition; the signing key must be the active attestor or, while a
    // rotation overlap window is open, the previous one.
    pub fn submit_attestation(
        env: Env,
        epoch: u64,
        proof: Proof,
        liab_root: BytesN<32>,
        res_root: BytesN<32>,
        solvent: bool,
        res_sig: BytesN<64>,
    ) -> Result<Attestation, Error> {
        // Classic entry point: the custodian signs with whichever key is
        // currently active. During a rotation overlap window a custodian that
        // still holds the previous key publishes via
        // [`Self::submit_attestation_signed`] instead.
        let signer = Self::attestor_key(&env);
        Self::submit(
            env,
            epoch,
            proof,
            liab_root,
            res_root,
            solvent,
            signer,
            res_sig,
        )
    }

    /// Same as [`Self::submit_attestation`], but the custodian states which of
    /// the registered attestor keys produced `res_sig`. This is what makes a
    /// rotation with an overlap window usable: while the window is open, a
    /// signature from either the current or the previous key verifies.
    pub fn submit_attestation_signed(
        env: Env,
        epoch: u64,
        proof: Proof,
        liab_root: BytesN<32>,
        res_root: BytesN<32>,
        solvent: bool,
        res_signer: BytesN<32>,
        res_sig: BytesN<64>,
    ) -> Result<Attestation, Error> {
        Self::submit(
            env,
            epoch,
            proof,
            liab_root,
            res_root,
            solvent,
            res_signer,
            res_sig,
        )
    }

    /// Rotates the reserve-signature attestor. `new_attestor` becomes the key
    /// that signs new publications and the key it replaces is retained as the
    /// overlap key, so publications signed by either key are accepted until
    /// [`Self::end_attestor_overlap`] is called. Only the stored admin may
    /// rotate; anyone else gets [`Error::Unauthorized`].
    pub fn rotate_attestor(
        env: Env,
        caller: Address,
        new_attestor: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &caller)?;

        let store = env.storage().instance();
        let previous: BytesN<32> = store
            .get(&DataKey::Attestor)
            .unwrap_or_else(|| BytesN::from_array(&env, &[0u8; 32]));
        store.set(&DataKey::Attestor, &new_attestor);
        if previous == BytesN::from_array(&env, &[0u8; 32]) {
            // There is no meaningful key to overlap with, so start clean.
            store.remove(&DataKey::PrevAttestor);
        } else {
            store.set(&DataKey::PrevAttestor, &previous);
        }

        AttestorRotated {
            current: new_attestor,
            previous,
        }
        .publish(&env);
        Ok(())
    }

    /// Closes the overlap window early, retiring the previous attestor so only
    /// the current key is accepted from now on.
    pub fn end_attestor_overlap(env: Env, caller: Address) -> Result<(), Error> {
        Self::require_admin(&env, &caller)?;
        let store = env.storage().instance();
        let retired: Option<BytesN<32>> = store.get(&DataKey::PrevAttestor);
        if let Some(retired) = retired {
            store.remove(&DataKey::PrevAttestor);
            AttestorOverlapEnded { retired }.publish(&env);
        }
        Ok(())
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

    /// Runs the shared body of the two submission entry points. `res_signer`
    /// names the registered key that produced `res_sig`.
    fn submit(
        env: Env,
        epoch: u64,
        proof: Proof,
        liab_root: BytesN<32>,
        res_root: BytesN<32>,
        solvent: bool,
        res_signer: BytesN<32>,
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
        let public_inputs =
            Self::public_inputs(&env, &liab_root, &res_root, solvent, onchain_reserves);
        if !groth16::verify(&env, &vk, &proof, &public_inputs) {
            return Err(Error::InvalidProof);
        }

        Self::verify_reserve_sig(&env, epoch, &res_root, &res_signer, &res_sig)?;

        Ok(Self::record(
            &env,
            epoch,
            liab_root,
            res_root,
            onchain_reserves,
            solvent,
        ))
    }

    /// Authorizes `caller` as the stored admin. Non-admins that authenticate as
    /// themselves are rejected with [`Error::Unauthorized`] rather than a bare
    /// auth failure.
    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        caller.require_auth();
        if caller != &Self::admin(env)? {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    /// The currently active attestor key, or the all-zero key when none is set
    /// (which disables the reserve-signature check).
    fn attestor_key(env: &Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::Attestor)
            .unwrap_or_else(|| BytesN::from_array(env, &[0u8; 32]))
    }

    fn verify_reserve_sig(
        env: &Env,
        epoch: u64,
        res_root: &BytesN<32>,
        signer: &BytesN<32>,
        sig: &BytesN<64>,
    ) -> Result<(), Error> {
        let current = Self::attestor_key(env);
        if current == BytesN::from_array(env, &[0u8; 32]) {
            // No attestor configured: nothing to verify against.
            return Ok(());
        }

        let previous: Option<BytesN<32>> = env.storage().instance().get(&DataKey::PrevAttestor);
        if signer != &current && previous.as_ref() != Some(signer) {
            // Only the current key, or the previous key while the overlap window
            // is open, can attest the off-chain reserves.
            return Err(Error::UnknownAttestor);
        }

        let mut msg = Bytes::new(env);
        msg.extend_from_slice(&epoch.to_be_bytes());
        msg.extend_from_slice(&res_root.to_array());
        env.crypto().ed25519_verify(signer, &msg, sig);
        Ok(())
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
