//! Acertana — on-chain pick commitment for a free-to-play World Cup prediction
//! pool. The chain's ONLY job is tamper-proof, kickoff-locked, copy-proof
//! commitment of picks. No token custody, no escrow, no staking, no transfers
//! of value.
//!
//! Design of record: docs/superpowers/specs/2026-07-09-acertana-design-decisions-design.md

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

declare_id!("9hhdvFyxcW95p3bJMUij5Bsq1rrURK4EfTSjqYv4T5zn");

/// Trusted authority allowed to register fixtures (kickoff times from TxLINE).
/// Rotatable only by program upgrade for now (spec: out of scope beyond a
/// single key).
///
/// Baked in at build time: set FIXTURE_AUTHORITY_PUBKEY when building for a
/// real network (`FIXTURE_AUTHORITY_PUBKEY=<pubkey> anchor build`), with the
/// matching keypair kept OUT of git. Without the env var it falls back to the
/// PUBLISHED DEV KEY (tests/fixtures/fixture-authority.json) — fine for local
/// validators and `cargo test`, never for a deploy.
pub const FIXTURE_AUTHORITY: Pubkey =
    Pubkey::from_str_const(match option_env!("FIXTURE_AUTHORITY_PUBKEY") {
        Some(pubkey) => pubkey,
        None => "H83TTjZvtwWBVc18F3R3CecctPun6YcFv26UKTy9ozFk",
    });

pub const POOL_NAME_MAX_LEN: usize = 32;

#[program]
pub mod acertana {
    use super::*;

    /// Register a fixture's kickoff time. Fixture-authority only.
    pub fn register_fixture(
        ctx: Context<RegisterFixture>,
        fixture_id: u64,
        kickoff_ts: i64,
    ) -> Result<()> {
        require!(kickoff_ts > 0, AcertanaError::InvalidKickoff);
        let fixture = &mut ctx.accounts.fixture;
        fixture.fixture_id = fixture_id;
        fixture.kickoff_ts = kickoff_ts;
        fixture.bump = ctx.bumps.fixture;
        Ok(())
    }

    /// Create a prediction pool (identity anchor; membership lives off-chain).
    pub fn create_pool(ctx: Context<CreatePool>, pool_id: u64, name: String) -> Result<()> {
        require!(name.len() <= POOL_NAME_MAX_LEN, AcertanaError::NameTooLong);
        let pool = &mut ctx.accounts.pool;
        pool.organizer = ctx.accounts.organizer.key();
        pool.pool_id = pool_id;
        pool.name = name;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Commit a hidden pick for one fixture. Rejected at/after kickoff.
    /// `commitment = keccak(home_goals ‖ away_goals ‖ salt)`.
    pub fn commit_pick(
        ctx: Context<CommitPick>,
        fixture_id: u64,
        commitment: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            now < ctx.accounts.fixture.kickoff_ts,
            AcertanaError::FixtureLocked
        );
        let entry = &mut ctx.accounts.entry;
        entry.pool = ctx.accounts.pool.key();
        entry.participant = ctx.accounts.participant.key();
        entry.fixture_id = fixture_id;
        entry.commitment = commitment;
        entry.revealed = false;
        entry.home_goals = 0;
        entry.away_goals = 0;
        entry.bump = ctx.bumps.entry;
        Ok(())
    }

    /// Reveal a pick after kickoff. Permissionless: the tx only proves the
    /// hash preimage, so any payer may submit it (enables backend auto-reveal).
    pub fn reveal_pick(
        ctx: Context<RevealPick>,
        home_goals: u8,
        away_goals: u8,
        salt: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= ctx.accounts.fixture.kickoff_ts,
            AcertanaError::FixtureNotStarted
        );
        let entry = &mut ctx.accounts.entry;
        require!(!entry.revealed, AcertanaError::AlreadyRevealed);
        let mut preimage = [0u8; 34];
        preimage[0] = home_goals;
        preimage[1] = away_goals;
        preimage[2..].copy_from_slice(&salt);
        require!(
            keccak::hash(&preimage).to_bytes() == entry.commitment,
            AcertanaError::CommitmentMismatch
        );
        entry.revealed = true;
        entry.home_goals = home_goals;
        entry.away_goals = away_goals;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(fixture_id: u64)]
pub struct RegisterFixture<'info> {
    #[account(
        init,
        payer = authority,
        space = Fixture::SPACE,
        seeds = [b"fixture", fixture_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub fixture: Account<'info, Fixture>,

    #[account(mut, address = FIXTURE_AUTHORITY @ AcertanaError::UnauthorizedFixtureAuthority)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CreatePool<'info> {
    #[account(
        init,
        payer = organizer,
        space = Pool::SPACE,
        seeds = [b"pool", organizer.key().as_ref(), pool_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(fixture_id: u64)]
pub struct CommitPick<'info> {
    pub pool: Account<'info, Pool>,

    #[account(
        seeds = [b"fixture", fixture_id.to_le_bytes().as_ref()],
        bump = fixture.bump,
    )]
    pub fixture: Account<'info, Fixture>,

    #[account(
        init,
        payer = participant,
        space = Entry::SPACE,
        seeds = [
            b"entry",
            pool.key().as_ref(),
            participant.key().as_ref(),
            fixture_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub entry: Account<'info, Entry>,

    #[account(mut)]
    pub participant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealPick<'info> {
    #[account(
        seeds = [b"fixture", entry.fixture_id.to_le_bytes().as_ref()],
        bump = fixture.bump,
    )]
    pub fixture: Account<'info, Fixture>,

    #[account(
        mut,
        seeds = [
            b"entry",
            entry.pool.as_ref(),
            entry.participant.as_ref(),
            entry.fixture_id.to_le_bytes().as_ref(),
        ],
        bump = entry.bump,
    )]
    pub entry: Account<'info, Entry>,
}

/// Global fixture registry entry: authoritative kickoff time for one match.
#[account]
pub struct Fixture {
    pub fixture_id: u64,
    pub kickoff_ts: i64,
    pub bump: u8,
}

impl Fixture {
    pub const SPACE: usize = 8 + 8 + 8 + 1; // 25
}

/// A prediction pool. Identity anchor only — roster/config live off-chain.
#[account]
pub struct Pool {
    pub organizer: Pubkey,
    pub pool_id: u64,
    pub name: String,
    pub bump: u8,
}

impl Pool {
    pub const SPACE: usize = 8 + 32 + 8 + (4 + POOL_NAME_MAX_LEN) + 1; // 85
}

/// One participant's committed (then revealed) pick for one fixture.
/// `pool` is stored (not only in seeds) so leaderboards can memcmp-filter
/// getProgramAccounts by pool.
#[account]
pub struct Entry {
    pub pool: Pubkey,
    pub participant: Pubkey,
    pub fixture_id: u64,
    pub commitment: [u8; 32],
    pub revealed: bool,
    /// Meaningful only when `revealed`.
    pub home_goals: u8,
    pub away_goals: u8,
    pub bump: u8,
}

impl Entry {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 32 + 1 + 1 + 1 + 1; // 116
}

#[cfg(test)]
mod tests {
    use anchor_lang::solana_program::keccak;

    fn commitment_hex(home: u8, away: u8, salt: &[u8; 32]) -> String {
        let mut preimage = [0u8; 34];
        preimage[0] = home;
        preimage[1] = away;
        preimage[2..].copy_from_slice(salt);
        keccak::hash(&preimage)
            .to_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    /// Cross-check vectors shared with the TS client lib
    /// (app/src/lib/commitment/commitment.test.ts). Keep in sync.
    #[test]
    fn commitment_test_vectors() {
        let zero_salt = [0u8; 32];
        let ones_salt = [0x11u8; 32];
        let inc_salt: [u8; 32] = core::array::from_fn(|i| i as u8);

        let v00 = commitment_hex(0, 0, &zero_salt);
        let v99 = commitment_hex(9, 9, &ones_salt);
        let v21 = commitment_hex(2, 1, &inc_salt);
        println!("(0,0,zeros) = {v00}");
        println!("(9,9,0x11s) = {v99}");
        println!("(2,1,incr)  = {v21}");
        assert_eq!(
            v00,
            "bf53adb76067fdab0d008aef3ad8b28bbb63c2ce4c2b63394ede73f01a70c865"
        );
        assert_eq!(
            v99,
            "a184b447732db82000bb9a63f2925a16cb9eb38abe40c3a8b1d50a05767e5a1b"
        );
        assert_eq!(
            v21,
            "73539fcb8771b64bd066f8db16ffd2bae8ba804f7c91360b08632ed7f23fc1d3"
        );
    }
}

#[error_code]
pub enum AcertanaError {
    #[msg("kickoff timestamp must be positive")]
    InvalidKickoff,
    #[msg("pool name exceeds 32 bytes")]
    NameTooLong,
    #[msg("fixture has kicked off; picks are locked")]
    FixtureLocked,
    #[msg("fixture has not kicked off; reveal not allowed yet")]
    FixtureNotStarted,
    #[msg("pick already revealed")]
    AlreadyRevealed,
    #[msg("reveal does not match the committed hash")]
    CommitmentMismatch,
    #[msg("signer is not the fixture authority")]
    UnauthorizedFixtureAuthority,
}
