#![cfg(test)]

use super::*;
use crate::fixtures;
use crate::groth16::{self, Proof, VerifyingKey};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Events as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{vec, Address, BytesN, Env, Event, TryFromVal, Val, Vec};

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
    h.token_admin.mint(&h.reserve_holder, &(fixtures::S_ONCHAIN + 1));

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
}
