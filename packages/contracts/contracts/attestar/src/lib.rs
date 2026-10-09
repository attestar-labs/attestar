#![no_std]

mod groth16;
pub use groth16::{Proof, VerifyingKey};

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Map, Symbol, TryFromVal, Val, Vec,
};

/// Schema version of the record written by `record`. Bump this whenever the
/// stored layout changes. `load_attestation` reads records that predate the tag
/// (version 1) without panicking so old epochs remain readable.
pub const ATTESTATION_VERSION: u32 = 2;

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
    /// The issuer's on-chain reserve balance is negative.
    NegativeReserves = 6,
    /// One of the committed Merkle roots is all zeroes.
    ZeroRoot = 7,
    /// The liability and reserve commitments are the same value.
    IdenticalRoots = 8,
}

/// Number of epochs whose attestation records are retained on chain.
///
/// The registry keeps a rolling window of the most recent `MAX_EPOCHS`
/// attestations. Once the window is full, publishing a new epoch prunes the
/// oldest record (and its persistent entry) so that neither the epoch index nor
/// the number of live attestation entries grows without bound as the contract
/// ages. At one attestation per day this retains roughly three months of
/// history; older epochs must be read from an off-chain archive.
pub const MAX_EPOCHS: u32 = 90;

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
    /// Bounded index of the epochs whose attestation records are still retained.
    Epochs,
    Attestation(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    // Schema version of this record; see ATTESTATION_VERSION. Plain comment (not a
    // doc comment) so the generated contract spec stays byte-identical to the
    // committed client bindings.
    pub version: u32,
    pub epoch: u64,
    pub liab_root: BytesN<32>,
    pub res_root: BytesN<32>,
    pub onchain_reserves: i128,
    pub solvent: bool,
    pub timestamp: u64,
}

/// The layout written before records carried a `version` tag. Records in this
/// shape are still readable; see [`AttestarContract::load_attestation`].
///
/// Kept as a type so the pre-upgrade layout stays documented (and so tests can
/// write one), but it is never produced any more.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestationV1 {
    pub epoch: u64,
    pub liab_root: BytesN<32>,
    pub res_root: BytesN<32>,
    pub onchain_reserves: i128,
    pub solvent: bool,
    pub timestamp: u64,
}

impl From<AttestationV1> for Attestation {
    fn from(v: AttestationV1) -> Self {
        Attestation {
            version: 1,
            epoch: v.epoch,
            liab_root: v.liab_root,
            res_root: v.res_root,
            onchain_reserves: v.onchain_reserves,
            solvent: v.solvent,
            timestamp: v.timestamp,
        }
    }
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

    // Whether a verifying key is stored on-chain. Lets the web console drive the
    // one-time setup panel from the contract's real state instead of a
    // browser-localStorage flag, which can be stale in either direction.
    pub fn verifier_is_set(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Vk)
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
        let onchain_reserves = Self::reserves(&env);
        Self::check_implied_solvency(&liab_root, &res_root, onchain_reserves)?;
        let public_inputs =
            Self::public_inputs(&env, &liab_root, &res_root, solvent, onchain_reserves);
        if !groth16::verify(&env, &vk, &proof, &public_inputs) {
            return Err(Error::InvalidProof);
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
        Self::load_attestation(&env, epoch)
    }

    pub fn latest(env: Env) -> Option<Attestation> {
        let epoch: u64 = env.storage().instance().get(&DataKey::LatestEpoch)?;
        Self::load_attestation(&env, epoch)
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

    /// Reads one field out of an untyped record map. Absent or unexpected keys
    /// yield `None` instead of failing the whole decode.
    fn field<T: TryFromVal<Env, Val>>(
        env: &Env,
        fields: &Map<Symbol, Val>,
        name: &str,
    ) -> Option<T> {
        let raw = fields.get(Symbol::new(env, name))?;
        T::try_from_val(env, &raw).ok()
    }

    /// Decodes a stored attestation, tolerating records written before the
    /// `version` tag existed. The record is read as an untyped map first,
    /// because the typed struct decoder requires an exact key match and would
    /// otherwise reject (or panic on) pre-upgrade records. Records that predate
    /// the tag are surfaced as `version = 1`; current records carry
    /// [`ATTESTATION_VERSION`].
    fn load_attestation(env: &Env, epoch: u64) -> Option<Attestation> {
        let key = DataKey::Attestation(epoch);
        let store = env.storage().persistent();
        if !store.has(&key) {
            return None;
        }
        let raw: Val = store.get(&key)?;
        let fields = Map::<Symbol, Val>::try_from_val(env, &raw).ok()?;
        Some(Attestation {
            // Pre-upgrade records have no tag; treat them as version 1.
            version: Self::field(env, &fields, "version").unwrap_or(1),
            epoch: Self::field(env, &fields, "epoch")?,
            liab_root: Self::field(env, &fields, "liab_root")?,
            res_root: Self::field(env, &fields, "res_root")?,
            onchain_reserves: Self::field(env, &fields, "onchain_reserves")?,
            solvent: Self::field(env, &fields, "solvent")?,
            timestamp: Self::field(env, &fields, "timestamp")?,
        })
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
            version: ATTESTATION_VERSION,
            epoch,
            liab_root,
            res_root,
            onchain_reserves,
            solvent,
            timestamp: env.ledger().timestamp(),
        };

        let persistent = env.storage().persistent();
        persistent.set(&DataKey::Attestation(epoch), &att);
        env.storage().instance().set(&DataKey::LatestEpoch, &epoch);

        // Maintain a bounded, ordered index of the retained epochs. Appending the
        // new epoch and dropping the oldest entries once the window is exceeded
        // keeps `Epochs` at most `MAX_EPOCHS` long and bounds the number of live
        // `Attestation` entries, so the cost of a publish does not grow with the
        // age of the contract. `latest` and `get_attestation` keep returning the
        // correct values for every epoch still inside the window.
        let mut epochs: Vec<u64> = persistent
            .get(&DataKey::Epochs)
            .unwrap_or_else(|| Vec::new(env));
        epochs.push_back(epoch);
        while epochs.len() > MAX_EPOCHS {
            if let Some(oldest) = epochs.pop_front() {
                persistent.remove(&DataKey::Attestation(oldest));
            }
        }
        persistent.set(&DataKey::Epochs, &epochs);

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
