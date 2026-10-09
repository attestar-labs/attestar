#![cfg(test)]

use super::*;
use crate::fixtures;
use crate::groth16::{self, Proof, VerifyingKey};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Events as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{vec, Address, BytesN, Env, Event, TryFromVal, Val, Vec};

// Minimal token used only to drive `reserves()` negative, which a Stellar asset
// contract (whose trustline balances are unsigned) cannot express.
#[contract]
pub struct NegativeBalanceToken;

#[contractimpl]
impl NegativeBalanceToken {
    pub fn set_balance(env: Env, id: Address, amount: i128) {
        env.storage().persistent().set(&id, &amount);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }
}

fn bytesn<const N: usize>(env: &Env, a: &[u8; N]) -> BytesN<N> {
    BytesN::from_array(env, a)
}

fn make_vk(env: &Env) -> VerifyingKey {
    let mut ic = Vec::new(env);
    for p in fixtures::IC.iter() {
        ic.push_back(bytesn(env, p));
    }
    VerifyingKey {
        alpha: bytesn(env, &fixtures::ALPHA),
        beta: bytesn(env, &fixtures::BETA),
        gamma: bytesn(env, &fixtures::GAMMA),
        delta: bytesn(env, &fixtures::DELTA),
        ic,
    }
}

fn solvent_proof(env: &Env) -> Proof {
    Proof {
        a: bytesn(env, &fixtures::S_PROOF_A),
        b: bytesn(env, &fixtures::S_PROOF_B),
        c: bytesn(env, &fixtures::S_PROOF_C),
    }
}

fn insolvent_proof(env: &Env) -> Proof {
    Proof {
        a: bytesn(env, &fixtures::I_PROOF_A),
        b: bytesn(env, &fixtures::I_PROOF_B),
        c: bytesn(env, &fixtures::I_PROOF_C),
    }
}

fn custodian_key() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}

fn res_signature(sk: &SigningKey, epoch: u64, res_root: &[u8; 32]) -> [u8; 64] {
    let mut msg = [0u8; 40];
    msg[..8].copy_from_slice(&epoch.to_be_bytes());
    msg[8..].copy_from_slice(res_root);
    sk.sign(&msg).to_bytes()
}

struct Harness<'a> {
    env: Env,
    cid: Address,
    client: AttestarContractClient<'a>,
    token_admin: StellarAssetClient<'a>,
    reserve_holder: Address,
    admin: Address,
    contract_id: Address,
    sk: SigningKey,
}

fn deploy(env: &Env, with_verifier: bool) -> Harness<'_> {
    env.mock_all_auths();
    let issuer = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let token_addr = sac.address();
    let token_admin = StellarAssetClient::new(env, &token_addr);
    let reserve_holder = Address::generate(env);

    let sk = custodian_key();
    let attestor = BytesN::from_array(env, &sk.verifying_key().to_bytes());

    let cid = env.register(AttestarContract, ());
    let client = AttestarContractClient::new(env, &cid);
    client.initialize(&issuer, &token_addr, &reserve_holder, &attestor);
    if with_verifier {
        client.set_verifier(&make_vk(env));
    }

    Harness {
        env: env.clone(),
        cid,
        client,
        token_admin,
        reserve_holder,
        admin: issuer,
        contract_id: cid,
        sk,
    }
}

fn submit_solvent(h: &Harness, epoch: u64) -> crate::Attestation {
    let proof = solvent_proof(&h.env);
    let liab = bytesn(&h.env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&h.env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&h.env, &res_signature(&h.sk, epoch, &fixtures::S_RES_ROOT));
    h.client
        .submit_attestation(&epoch, &proof, &liab, &res, &fixtures::S_SOLVENT, &sig)
}

#[test]
fn init_sets_up_empty_registry() {
    let env = Env::default();
    let h = deploy(&env, true);
    assert_eq!(h.client.get_attestation(&1), None);
    assert_eq!(h.client.latest(), None);
    assert_eq!(h.client.is_solvent(&1), false);
}

#[test]
fn verifier_is_set_reflects_set_verifier() {
    let env = Env::default();
    let unset = deploy(&env, false);
    assert!(!unset.client.verifier_is_set());

    let set = deploy(&env, true);
    assert!(set.client.verifier_is_set());
}

#[test]
fn double_init_fails() {
    let env = Env::default();
    let h = deploy(&env, true);
    let again = h.client.try_initialize(
        &Address::generate(&env),
        &Address::generate(&env),
        &Address::generate(&env),
        &BytesN::from_array(&env, &[1u8; 32]),
    );
    assert_eq!(again, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn groth16_accepts_valid_proof() {
    let env = Env::default();
    let id = env.register(AttestarContract, ());
    let vk = make_vk(&env);
    let proof = solvent_proof(&env);
    let pubs = vec![
        &env,
        bytesn(&env, &fixtures::S_PUB[0]),
        bytesn(&env, &fixtures::S_PUB[1]),
        bytesn(&env, &fixtures::S_PUB[2]),
        bytesn(&env, &fixtures::S_PUB[3]),
    ];
    let ok = env.as_contract(&id, || groth16::verify(&env, &vk, &proof, &pubs));
    assert!(ok, "valid Groth16 proof should verify");
}

#[test]
fn groth16_rejects_tampered_public_input() {
    let env = Env::default();
    let id = env.register(AttestarContract, ());
    let vk = make_vk(&env);
    let proof = solvent_proof(&env);
    let mut bad_solvent = fixtures::S_PUB[2];
    bad_solvent[31] ^= 1;
    let pubs = vec![
        &env,
        bytesn(&env, &fixtures::S_PUB[0]),
        bytesn(&env, &fixtures::S_PUB[1]),
        bytesn(&env, &bad_solvent),
        bytesn(&env, &fixtures::S_PUB[3]),
    ];
    let ok = env.as_contract(&id, || groth16::verify(&env, &vk, &proof, &pubs));
    assert!(!ok, "tampered public input must be rejected");
}

#[test]
fn solvent_when_reserves_cover_liabilities() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);

    let att = submit_solvent(&h, 1);

    assert!(att.solvent);
    assert_eq!(att.onchain_reserves, fixtures::S_ONCHAIN);
    assert_eq!(att.liab_root, bytesn(&env, &fixtures::S_LIAB_ROOT));
    assert!(h.client.is_solvent(&1));
    assert_eq!(h.client.latest(), Some(att));
}

#[test]
fn insolvent_recorded_when_reserves_short() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::I_ONCHAIN);

    let proof = insolvent_proof(&env);
    let liab = bytesn(&env, &fixtures::I_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::I_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&h.sk, 1, &fixtures::I_RES_ROOT));
    let att = h
        .client
        .submit_attestation(&1, &proof, &liab, &res, &fixtures::I_SOLVENT, &sig);

    assert!(!att.solvent);
    assert!(!h.client.is_solvent(&1));
}

#[test]
fn rejects_faked_onchain_reserves() {
    let env = Env::default();
    let h = deploy(&env, true);
    // The proof commits to onchain = S_ONCHAIN; minting a different balance makes
    // the contract substitute the true (different) figure, so verification fails.
    h.token_admin
        .mint(&h.reserve_holder, &(fixtures::S_ONCHAIN + 1));

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&h.sk, 1, &fixtures::S_RES_ROOT));
    let result =
        h.client
            .try_submit_attestation(&1, &proof, &liab, &res, &fixtures::S_SOLVENT, &sig);

    assert_eq!(result, Err(Ok(Error::InvalidProof)));
}

#[test]
fn rejects_identical_liability_and_reserve_roots() {
    let env = Env::default();
    let h = deploy(&env, true);

    // The two commitments must describe different sums; submitting one root for both
    // is rejected on the signals alone, before the pairing is attempted.
    let proof = solvent_proof(&env);
    let root = bytesn(&env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&h.sk, 1, &fixtures::S_RES_ROOT));
    let result =
        h.client
            .try_submit_attestation(&1, &proof, &root, &root, &fixtures::S_SOLVENT, &sig);

    assert_eq!(result, Err(Ok(Error::IdenticalRoots)));
}

#[test]
fn rejects_zero_commitments() {
    let env = Env::default();
    let h = deploy(&env, true);

    let proof = solvent_proof(&env);
    let zero = bytesn(&env, &[0u8; 32]);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&h.sk, 1, &fixtures::S_RES_ROOT));
    let result =
        h.client
            .try_submit_attestation(&1, &proof, &zero, &res, &fixtures::S_SOLVENT, &sig);
    assert_eq!(result, Err(Ok(Error::ZeroRoot)));

    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let result =
        h.client
            .try_submit_attestation(&1, &proof, &liab, &zero, &fixtures::S_SOLVENT, &sig);
    assert_eq!(result, Err(Ok(Error::ZeroRoot)));
}

#[test]
fn rejects_negative_onchain_reserves() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let holder = Address::generate(&env);

    // A reserve balance that can be driven negative, which the SAC cannot express.
    let token_id = env.register(NegativeBalanceToken, ());
    NegativeBalanceTokenClient::new(&env, &token_id).set_balance(&holder, &-1);

    let sk = custodian_key();
    let attestor = BytesN::from_array(&env, &sk.verifying_key().to_bytes());
    let cid = env.register(AttestarContract, ());
    let client = AttestarContractClient::new(&env, &cid);
    client.initialize(&issuer, &token_id, &holder, &attestor);
    client.set_verifier(&make_vk(&env));

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&sk, 1, &fixtures::S_RES_ROOT));
    let result =
        client.try_submit_attestation(&1, &proof, &liab, &res, &fixtures::S_SOLVENT, &sig);

    assert_eq!(result, Err(Ok(Error::NegativeReserves)));
fn renews_ttls_on_every_hot_path_access() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);
    submit_solvent(&h, 1);

    // The recording test host revives an expired persistent entry on access, so
    // archival cannot be observed as a missing record here; the recorded TTL is
    // what tells us whether the contract renewed an entry.
    let cid = h.client.address.clone();
    let record = DataKey::Attestation(1);
    let ttl_at_write = env.as_contract(&cid, || env.storage().persistent().get_ttl(&record));
    let instance_at_write = env.as_contract(&cid, || env.storage().instance().get_ttl());
    assert!(
        ttl_at_write > TTL_THRESHOLD_LEDGERS,
        "the record written by submit_attestation must get a renewed TTL"
    );
    assert!(
        instance_at_write > TTL_THRESHOLD_LEDGERS,
        "submit_attestation must renew the instance (admin, verifier, latest pointer)"
    );

    // Let both entries age down to the renewal threshold...
    let burn = ttl_at_write.min(instance_at_write) - TTL_THRESHOLD_LEDGERS;
    env.ledger().set_sequence_number(env.ledger().sequence() + burn);
    let record_before = env.as_contract(&cid, || env.storage().persistent().get_ttl(&record));
    let instance_before = env.as_contract(&cid, || env.storage().instance().get_ttl());
    assert!(record_before <= TTL_THRESHOLD_LEDGERS);
    assert!(instance_before <= TTL_THRESHOLD_LEDGERS);

    // ...and a single read puts the life back on both of them.
    assert_eq!(h.client.latest().unwrap().epoch, 1);
    assert!(h.client.is_solvent(&1));
    assert!(h.client.get_attestation(&1).is_some());
    let ttl_after = env.as_contract(&cid, || env.storage().persistent().get_ttl(&record));
    let instance_after = env.as_contract(&cid, || env.storage().instance().get_ttl());
    assert!(
        ttl_after > TTL_THRESHOLD_LEDGERS,
        "reading the latest record must renew it"
    );
    assert!(
        instance_after > TTL_THRESHOLD_LEDGERS,
        "reading must renew the instance as well"
    );
    assert!(ttl_after > record_before);
    assert!(instance_after > instance_before);
}

#[test]
fn rejects_duplicate_epoch() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);
    submit_solvent(&h, 1);

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&h.sk, 1, &fixtures::S_RES_ROOT));
    let result =
        h.client
            .try_submit_attestation(&1, &proof, &liab, &res, &fixtures::S_SOLVENT, &sig);

    assert_eq!(result, Err(Ok(Error::EpochExists)));
}

#[test]
fn rejects_when_verifier_not_set() {
    let env = Env::default();
    let h = deploy(&env, false);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let sig = BytesN::from_array(&env, &res_signature(&h.sk, 1, &fixtures::S_RES_ROOT));
    let result =
        h.client
            .try_submit_attestation(&1, &proof, &liab, &res, &fixtures::S_SOLVENT, &sig);

    assert_eq!(result, Err(Ok(Error::VerifierNotSet)));
}

#[test]
fn prunes_epoch_history_beyond_the_window() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);

    let window = MAX_EPOCHS as u64;
    // Publish one more epoch than the retained window.
    for epoch in 1..=window + 1 {
        submit_solvent(&h, epoch);
    }

    // The epoch index is capped at the documented window...
    let epochs: Vec<u64> = h.env.as_contract(&h.cid, || {
        h.env.storage().persistent().get(&DataKey::Epochs).unwrap()
    });
    assert_eq!(epochs.len(), MAX_EPOCHS);

    // ...the oldest record and its index slot have been pruned...
    assert_eq!(h.client.get_attestation(&1), None);
    assert!(!h.client.is_solvent(&1));

    // ...while every epoch still inside the window answers correctly.
    assert!(h.client.get_attestation(&2).is_some());
    let newest = h.client.get_attestation(&(window + 1)).unwrap();
    assert_eq!(newest.epoch, window + 1);
    assert!(h.client.is_solvent(&(window + 1)));
    assert_eq!(h.client.latest().unwrap().epoch, window + 1);
}

#[test]
#[should_panic]
fn rejects_bad_custodian_signature() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let bad_sig = BytesN::from_array(&env, &[0u8; 64]);
    h.client
        .submit_attestation(&1, &proof, &liab, &res, &fixtures::S_SOLVENT, &bad_sig);
}

fn second_custodian_key() -> SigningKey {
    SigningKey::from_bytes(&[11u8; 32])
}

fn pk(sk: &SigningKey) -> [u8; 32] {
    sk.verifying_key().to_bytes()
}

#[test]
fn non_admin_cannot_rotate_attestor() {
    let env = Env::default();
    let h = deploy(&env, true);

    let stranger = Address::generate(&env);
    let new = BytesN::from_array(&env, &[3u8; 32]);
    let result = h.client.try_rotate_attestor(&stranger, &new);

    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn rotation_emits_event_and_keeps_previous_key() {
    let env = Env::default();
    let h = deploy(&env, true);

    let old = pk(&h.sk);
    let new_sk = second_custodian_key();
    let new = pk(&new_sk);

    h.client
        .rotate_attestor(&h.admin, &BytesN::from_array(&env, &new));

    // Rotation emitted a single event carrying the previous and new keys.
    let events = h.env.events().all();
    assert_eq!(events.events().len(), 1);
    let last = events.events().last().cloned().unwrap();
    let body = match last.body {
        soroban_sdk::xdr::ContractEventBody::V0(v0) => v0,
    };
    let data: Val = Val::try_from_val(&h.env, &body.data).unwrap();
    let expected = AttestorRotated {
        current: BytesN::from_array(&env, &new),
        previous: BytesN::from_array(&env, &old),
    };
    let actual = soroban_sdk::xdr::ScVal::try_from_val(&h.env, &data).unwrap();
    let expected = soroban_sdk::xdr::ScVal::try_from_val(&h.env, &expected.data(&h.env)).unwrap();
    assert_eq!(actual, expected);

    // The new key is active and the old one is retained for the overlap window.
    let stored: BytesN<32> = h.env.as_contract(&h.contract_id, || {
        h.env.storage().instance().get(&DataKey::Attestor).unwrap()
    });
    assert_eq!(stored, BytesN::from_array(&env, &new));
    let prev: Option<BytesN<32>> = h
        .env
        .as_contract(&h.contract_id, || h.env.storage().instance().get(&DataKey::PrevAttestor));
    assert_eq!(prev, Some(BytesN::from_array(&env, &old)));
}

#[test]
fn either_registered_key_verifies_during_overlap_window() {
#[test]
fn record_stamps_current_schema_version() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);

    let old_sk = custodian_key();
    let new_sk = second_custodian_key();
    let new = BytesN::from_array(&env, &pk(&new_sk));
    h.client.rotate_attestor(&h.admin, &new);

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);

    // Epoch 1: signed by the outgoing key, still valid during the overlap.
    let old_sig = BytesN::from_array(&env, &res_signature(&old_sk, 1, &fixtures::S_RES_ROOT));
    let att_old = h.client.submit_attestation_signed(
        &1,
        &proof,
        &liab,
        &res,
        &fixtures::S_SOLVENT,
        &BytesN::from_array(&env, &pk(&old_sk)),
        &old_sig,
    );
    assert!(att_old.solvent);

    // Epoch 2: signed by the incoming key via the signed entry point.
    let new_sig = BytesN::from_array(&env, &res_signature(&new_sk, 2, &fixtures::S_RES_ROOT));
    let att_new = h.client.submit_attestation_signed(
        &2,
        &proof,
        &liab,
        &res,
        &fixtures::S_SOLVENT,
        &new,
        &new_sig,
    );
    assert!(att_new.solvent);

    // Epoch 3: the classic entry point now signs with the incoming key.
    let new_sig3 = BytesN::from_array(&env, &res_signature(&new_sk, 3, &fixtures::S_RES_ROOT));
    let att_classic =
        h.client
            .submit_attestation(&3, &proof, &liab, &res, &fixtures::S_SOLVENT, &new_sig3);
    assert!(att_classic.solvent);
}

#[test]
fn ended_overlap_window_rejects_the_retired_key() {
    let env = Env::default();
    let h = deploy(&env, true);
    h.token_admin.mint(&h.reserve_holder, &fixtures::S_ONCHAIN);

    let old_sk = custodian_key();
    let new_sk = second_custodian_key();
    h.client
        .rotate_attestor(&h.admin, &BytesN::from_array(&env, &pk(&new_sk)));
    h.client.end_attestor_overlap(&h.admin);
    let prev: Option<BytesN<32>> = h
        .env
        .as_contract(&h.contract_id, || h.env.storage().instance().get(&DataKey::PrevAttestor));
    assert_eq!(prev, None);

    let proof = solvent_proof(&env);
    let liab = bytesn(&env, &fixtures::S_LIAB_ROOT);
    let res = bytesn(&env, &fixtures::S_RES_ROOT);
    let old_sig = BytesN::from_array(&env, &res_signature(&old_sk, 1, &fixtures::S_RES_ROOT));
    let result = h.client.try_submit_attestation_signed(
        &1,
        &proof,
        &liab,
        &res,
        &fixtures::S_SOLVENT,
        &BytesN::from_array(&env, &pk(&old_sk)),
        &old_sig,
    );

    assert_eq!(result, Err(Ok(Error::UnknownAttestor)));
    let att = submit_solvent(&h, 1);
    assert_eq!(att.version, ATTESTATION_VERSION);

    let read_back = h.client.get_attestation(&1).unwrap();
    assert_eq!(read_back.version, ATTESTATION_VERSION);
    assert_eq!(h.client.latest(), Some(read_back));
}

#[test]
fn legacy_record_without_version_tag_is_still_readable() {
    let env = Env::default();
    let h = deploy(&env, true);

    // Simulate a record written before the `version` tag existed by storing the
    // pre-upgrade layout directly under the same key.
    let legacy_epoch = 7u64;
    h.env.as_contract(&h.contract_id, || {
        let legacy = AttestationV1 {
            epoch: legacy_epoch,
            liab_root: bytesn(&h.env, &fixtures::S_LIAB_ROOT),
            res_root: bytesn(&h.env, &fixtures::S_RES_ROOT),
            onchain_reserves: fixtures::S_ONCHAIN,
            solvent: true,
            timestamp: 1234,
        };
        h.env
            .storage()
            .persistent()
            .set(&DataKey::Attestation(legacy_epoch), &legacy);
    });

    let att = h.client.get_attestation(&legacy_epoch).unwrap();
    assert_eq!(att.version, 1);
    assert_eq!(att.epoch, legacy_epoch);
    assert_eq!(att.timestamp, 1234);
    assert_eq!(att.onchain_reserves, fixtures::S_ONCHAIN);
    assert!(att.solvent);
    assert!(h.client.is_solvent(&legacy_epoch));
fn spub(env: &Env, i: usize) -> BytesN<32> {
    bytesn(env, &fixtures::S_PUB[i])
}

fn zero_proof(env: &Env) -> Proof {
    Proof {
        a: bytesn(env, &[0u8; 64]),
        b: bytesn(env, &[0u8; 128]),
        c: bytesn(env, &[0u8; 64]),
    }
}

fn zero_vk(env: &Env, ic_len: u32) -> VerifyingKey {
    let mut ic = Vec::new(env);
    for _ in 0..ic_len {
        ic.push_back(bytesn(env, &[0u8; 64]));
    }
    VerifyingKey {
        alpha: bytesn(env, &[0u8; 64]),
        beta: bytesn(env, &[0u8; 128]),
        gamma: bytesn(env, &[0u8; 128]),
        delta: bytesn(env, &[0u8; 128]),
        ic,
    }
}

#[test]
fn groth16_rejects_zero_proof() {
    let env = Env::default();
    let id = env.register(AttestarContract, ());
    let vk = make_vk(&env);
    let proof = zero_proof(&env);
    let pubs = vec![
        &env,
        spub(&env, 0),
        spub(&env, 1),
        spub(&env, 2),
        spub(&env, 3),
    ];
    let ok = env.as_contract(&id, || groth16::verify(&env, &vk, &proof, &pubs));
    assert!(!ok, "an all-zero proof must be rejected, not accepted");
}

#[test]
fn groth16_rejects_mismatched_ic_length() {
    let env = Env::default();
    let id = env.register(AttestarContract, ());
    let proof = solvent_proof(&env);
    // (ic_len, public-input count) pairs where ic_len != count + 1.
    let cases: [(u32, usize); 7] = [(5, 0), (5, 3), (5, 5), (4, 4), (2, 4), (1, 4), (0, 4)];
    for (ic_len, n) in cases {
        let vk = zero_vk(&env, ic_len);
        let mut pubs: Vec<BytesN<32>> = Vec::new(&env);
        for i in 0..n {
            pubs.push_back(spub(&env, i % 4));
        }
        let ok = env.as_contract(&id, || groth16::verify(&env, &vk, &proof, &pubs));
        assert!(
            !ok,
            "ic_len {ic_len} with {n} public inputs must be rejected"
        );
    }
}

#[test]
fn groth16_rejects_wrong_public_input_count() {
    let env = Env::default();
    let id = env.register(AttestarContract, ());
    let vk = make_vk(&env);
    let proof = solvent_proof(&env);
    // vk.ic has five points, so exactly four public inputs are expected.
    for n in [0usize, 3, 5] {
        let mut pubs: Vec<BytesN<32>> = Vec::new(&env);
        for i in 0..n {
            pubs.push_back(spub(&env, i % 4));
        }
        let ok = env.as_contract(&id, || groth16::verify(&env, &vk, &proof, &pubs));
        assert!(!ok, "a public-input count of {n} must be rejected");
    }
}
