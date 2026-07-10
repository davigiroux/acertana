//! Integration tests for the acertana program, run against the compiled SBF
//! binary (target/deploy/acertana.so) in an in-process LiteSVM.
//!
//! Anchor instruction data is computed manually (discriminator = first 8
//! bytes of sha256("global:<ix_name>"), args borsh-encoded) so the tests
//! don't depend on anchor-lang.

use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_sdk::{
    clock::Clock,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::{Transaction, TransactionError},
};
use std::str::FromStr;

const PROGRAM_ID: &str = "9hhdvFyxcW95p3bJMUij5Bsq1rrURK4EfTSjqYv4T5zn";
const KICKOFF_TS: i64 = 1_700_000_000;

// Anchor custom error codes (declaration order, starting at 6000).
const ERR_FIXTURE_LOCKED: u32 = 6002;
const ERR_FIXTURE_NOT_STARTED: u32 = 6003;
const ERR_ALREADY_REVEALED: u32 = 6004;
const ERR_COMMITMENT_MISMATCH: u32 = 6005;
const ERR_UNAUTHORIZED_FIXTURE_AUTHORITY: u32 = 6006;

fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID).unwrap()
}

fn disc(name: &str) -> [u8; 8] {
    let hash = Sha256::digest(format!("global:{name}").as_bytes());
    hash[..8].try_into().unwrap()
}

fn fixture_authority() -> Keypair {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/fixtures/fixture-authority.json"
    );
    let bytes: Vec<u8> = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    Keypair::from_bytes(&bytes).unwrap()
}

fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let so = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/acertana.so");
    svm.add_program(program_id(), &std::fs::read(so).unwrap());
    set_clock(&mut svm, KICKOFF_TS - 3600); // default: an hour before kickoff
    svm
}

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
}

fn fund(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    kp
}

fn fixture_pda(fixture_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"fixture", &fixture_id.to_le_bytes()],
        &program_id(),
    )
    .0
}

fn pool_pda(organizer: &Pubkey, pool_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"pool", organizer.as_ref(), &pool_id.to_le_bytes()],
        &program_id(),
    )
    .0
}

fn entry_pda(pool: &Pubkey, participant: &Pubkey, fixture_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"entry", pool.as_ref(), participant.as_ref(), &fixture_id.to_le_bytes()],
        &program_id(),
    )
    .0
}

fn commitment(home: u8, away: u8, salt: &[u8; 32]) -> [u8; 32] {
    let mut preimage = [0u8; 34];
    preimage[0] = home;
    preimage[1] = away;
    preimage[2..].copy_from_slice(salt);
    solana_keccak_hasher::hash(&preimage).to_bytes()
}

fn register_fixture_ix(authority: &Pubkey, fixture_id: u64, kickoff_ts: i64) -> Instruction {
    let mut data = disc("register_fixture").to_vec();
    data.extend_from_slice(&fixture_id.to_le_bytes());
    data.extend_from_slice(&kickoff_ts.to_le_bytes());
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(fixture_pda(fixture_id), false),
            AccountMeta::new(*authority, true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    }
}

fn create_pool_ix(organizer: &Pubkey, pool_id: u64, name: &str) -> Instruction {
    let mut data = disc("create_pool").to_vec();
    data.extend_from_slice(&pool_id.to_le_bytes());
    data.extend_from_slice(&(name.len() as u32).to_le_bytes());
    data.extend_from_slice(name.as_bytes());
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(pool_pda(organizer, pool_id), false),
            AccountMeta::new(*organizer, true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    }
}

fn commit_pick_ix(
    pool: &Pubkey,
    participant: &Pubkey,
    fixture_id: u64,
    commitment: [u8; 32],
) -> Instruction {
    let mut data = disc("commit_pick").to_vec();
    data.extend_from_slice(&fixture_id.to_le_bytes());
    data.extend_from_slice(&commitment);
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*pool, false),
            AccountMeta::new_readonly(fixture_pda(fixture_id), false),
            AccountMeta::new(entry_pda(pool, participant, fixture_id), false),
            AccountMeta::new(*participant, true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    }
}

fn reveal_pick_ix(
    pool: &Pubkey,
    participant: &Pubkey,
    fixture_id: u64,
    home: u8,
    away: u8,
    salt: &[u8; 32],
) -> Instruction {
    let mut data = disc("reveal_pick").to_vec();
    data.push(home);
    data.push(away);
    data.extend_from_slice(salt);
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(fixture_pda(fixture_id), false),
            AccountMeta::new(entry_pda(pool, participant, fixture_id), false),
        ],
        data,
    }
}

fn send(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer: &Keypair,
    extra_signers: &[&Keypair],
) -> Result<(), TransactionError> {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).map(|_| ()).map_err(|e| e.err)
}

fn assert_custom_err(result: Result<(), TransactionError>, code: u32) {
    match result {
        Err(TransactionError::InstructionError(
            _,
            solana_sdk::instruction::InstructionError::Custom(c),
        )) => assert_eq!(c, code, "expected custom error {code}, got {c}"),
        other => panic!("expected custom error {code}, got {other:?}"),
    }
}

/// Registers fixture 42 and a pool, returning (pool, organizer, participant).
fn setup_fixture_and_pool(svm: &mut LiteSVM, fixture_id: u64) -> (Pubkey, Keypair, Keypair) {
    let authority = fixture_authority();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
    send(
        svm,
        &[register_fixture_ix(&authority.pubkey(), fixture_id, KICKOFF_TS)],
        &authority,
        &[],
    )
    .unwrap();

    let organizer = fund(svm);
    send(svm, &[create_pool_ix(&organizer.pubkey(), 1, "world-cup")], &organizer, &[]).unwrap();

    let participant = fund(svm);
    let pool = pool_pda(&organizer.pubkey(), 1);
    (pool, organizer, participant)
}

#[test]
fn happy_path_commit_then_reveal() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, _org, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    let salt = [7u8; 32];
    let (home, away) = (3u8, 1u8);
    let c = commitment(home, away, &salt);

    send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    )
    .unwrap();

    // Entry committed but not revealed.
    let entry_addr = entry_pda(&pool, &participant.pubkey(), fixture_id);
    let data = svm.get_account(&entry_addr).unwrap().data;
    assert_eq!(data.len(), 116, "Entry account size must be 116 bytes");
    assert_eq!(&data[80..112], &c, "stored commitment");
    assert_eq!(data[112], 0, "revealed == false");

    // Past kickoff, reveal.
    set_clock(&mut svm, KICKOFF_TS + 10);
    send(
        &mut svm,
        &[reveal_pick_ix(&pool, &participant.pubkey(), fixture_id, home, away, &salt)],
        &participant,
        &[],
    )
    .unwrap();

    let data = svm.get_account(&entry_addr).unwrap().data;
    // Layout: 8 disc | 32 pool | 32 participant | 8 fixture_id | 32 commitment
    //         | 1 revealed | 1 home | 1 away | 1 bump
    assert_eq!(&data[8..40], pool.as_ref());
    assert_eq!(&data[40..72], participant.pubkey().as_ref());
    assert_eq!(u64::from_le_bytes(data[72..80].try_into().unwrap()), fixture_id);
    assert_eq!(data[112], 1, "revealed == true");
    assert_eq!(data[113], home);
    assert_eq!(data[114], away);
}

#[test]
fn commit_at_or_after_kickoff_fails_fixture_locked() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, _org, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    // Exactly at kickoff is already locked (require now < kickoff).
    set_clock(&mut svm, KICKOFF_TS);
    let c = commitment(1, 1, &[0u8; 32]);
    let res = send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    );
    assert_custom_err(res, ERR_FIXTURE_LOCKED);
}

#[test]
fn reveal_before_kickoff_fails_fixture_not_started() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, _org, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    let salt = [9u8; 32];
    let c = commitment(2, 0, &salt);
    send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    )
    .unwrap();

    // Still before kickoff.
    let res = send(
        &mut svm,
        &[reveal_pick_ix(&pool, &participant.pubkey(), fixture_id, 2, 0, &salt)],
        &participant,
        &[],
    );
    assert_custom_err(res, ERR_FIXTURE_NOT_STARTED);
}

#[test]
fn reveal_wrong_preimage_fails_commitment_mismatch() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, _org, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    let salt = [9u8; 32];
    let c = commitment(2, 0, &salt);
    send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    )
    .unwrap();

    set_clock(&mut svm, KICKOFF_TS + 1);
    // Wrong goals.
    let res = send(
        &mut svm,
        &[reveal_pick_ix(&pool, &participant.pubkey(), fixture_id, 3, 0, &salt)],
        &participant,
        &[],
    );
    assert_custom_err(res, ERR_COMMITMENT_MISMATCH);

    // Wrong salt.
    let res = send(
        &mut svm,
        &[reveal_pick_ix(&pool, &participant.pubkey(), fixture_id, 2, 0, &[8u8; 32])],
        &participant,
        &[],
    );
    assert_custom_err(res, ERR_COMMITMENT_MISMATCH);
}

#[test]
fn duplicate_commit_same_entry_fails() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, _org, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    let c = commitment(1, 1, &[1u8; 32]);
    send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    )
    .unwrap();

    // Second commit to the same (pool, participant, fixture) PDA must fail:
    // the entry account already exists.
    let c2 = commitment(2, 2, &[2u8; 32]);
    let res = send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c2)],
        &participant,
        &[],
    );
    assert!(res.is_err(), "duplicate commit must fail, got Ok");
}

#[test]
fn register_fixture_non_authority_fails() {
    let mut svm = setup();
    let impostor = fund(&mut svm);
    let res = send(
        &mut svm,
        &[register_fixture_ix(&impostor.pubkey(), 7, KICKOFF_TS)],
        &impostor,
        &[],
    );
    assert_custom_err(res, ERR_UNAUTHORIZED_FIXTURE_AUTHORITY);
}

#[test]
fn double_reveal_fails_already_revealed() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, _org, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    let salt = [5u8; 32];
    let c = commitment(0, 0, &salt);
    send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    )
    .unwrap();

    set_clock(&mut svm, KICKOFF_TS + 100);
    send(
        &mut svm,
        &[reveal_pick_ix(&pool, &participant.pubkey(), fixture_id, 0, 0, &salt)],
        &participant,
        &[],
    )
    .unwrap();

    // Bump blockhash so the retry isn't deduped as an identical tx.
    svm.expire_blockhash();
    let res = send(
        &mut svm,
        &[reveal_pick_ix(&pool, &participant.pubkey(), fixture_id, 0, 0, &salt)],
        &participant,
        &[],
    );
    assert_custom_err(res, ERR_ALREADY_REVEALED);
}

#[test]
fn pda_derivations_and_account_sizes() {
    let mut svm = setup();
    let fixture_id = 42u64;
    let (pool, organizer, participant) = setup_fixture_and_pool(&mut svm, fixture_id);

    // Pool PDA matches seeds ["pool", organizer, pool_id_le].
    assert_eq!(pool, pool_pda(&organizer.pubkey(), 1));
    let pool_acct = svm.get_account(&pool).unwrap();
    assert_eq!(pool_acct.owner, program_id());
    assert_eq!(pool_acct.data.len(), 85, "Pool::SPACE");

    // Fixture PDA matches seeds ["fixture", fixture_id_le] and stores data.
    let fixture = fixture_pda(fixture_id);
    let fx = svm.get_account(&fixture).unwrap();
    assert_eq!(fx.owner, program_id());
    assert_eq!(fx.data.len(), 25, "Fixture::SPACE");
    assert_eq!(u64::from_le_bytes(fx.data[8..16].try_into().unwrap()), fixture_id);
    assert_eq!(i64::from_le_bytes(fx.data[16..24].try_into().unwrap()), KICKOFF_TS);

    // Entry PDA matches seeds ["entry", pool, participant, fixture_id_le]
    // and is exactly 116 bytes.
    let c = commitment(1, 2, &[3u8; 32]);
    send(
        &mut svm,
        &[commit_pick_ix(&pool, &participant.pubkey(), fixture_id, c)],
        &participant,
        &[],
    )
    .unwrap();
    let entry = entry_pda(&pool, &participant.pubkey(), fixture_id);
    let e = svm.get_account(&entry).unwrap();
    assert_eq!(e.owner, program_id());
    assert_eq!(e.data.len(), 116, "Entry::SPACE == 116");
}
