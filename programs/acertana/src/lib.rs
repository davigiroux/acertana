//! Acertana — on-chain pick commitment for a free-to-play World Cup prediction
//! pool. The chain's ONLY job is tamper-proof commitment of picks locked at
//! kickoff. No token custody, no escrow, no staking, no transfers of value.
//!
//! This is a SCAFFOLD: instructions compile but carry no logic. Every open
//! design decision is a TODO pointing at docs/DECISIONS.md — do not guess them
//! here.

use anchor_lang::prelude::*;

declare_id!("22uyFYac9ehpM8SjcRFWJVSyQ3Uc4TAiZu4cTGwsxyAo");

/// Placeholder byte budget for picks until the pick encoding is decided.
/// TODO(docs/DECISIONS.md#pick-data-model): replace with the real encoding size.
pub const PICKS_PLACEHOLDER_LEN: usize = 64;

/// Placeholder length for the pool name.
/// TODO(docs/DECISIONS.md#pda-seed-design-and-account-sizing): confirm max length.
pub const POOL_NAME_MAX_LEN: usize = 32;

#[program]
pub mod acertana {
    use super::*;

    /// Create a prediction pool. Stub only — no validation, no config yet.
    ///
    /// TODO(docs/DECISIONS.md#pda-seed-design-and-account-sizing): PDA seeds.
    /// TODO(docs/DECISIONS.md#pool-join-flow): how the share link references this pool.
    pub fn create_pool(ctx: Context<CreatePool>, name: String) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.organizer = ctx.accounts.organizer.key();
        pool.name = name;
        // TODO: tournament / scoring config (docs/DECISIONS.md#scoring-scheme).
        Ok(())
    }

    /// Commit a participant's picks for a pool. Stub only.
    ///
    /// TODO(docs/DECISIONS.md#commit-strategy): plaintext picks vs commit-reveal.
    /// TODO(docs/DECISIONS.md#pick-data-model): pick encoding (`picks` is an opaque
    ///   placeholder blob until decided).
    /// TODO(docs/DECISIONS.md#kickoff-lock-source): enforce the kickoff lock here —
    ///   reject commits at/after the fixture's kickoff timestamp.
    pub fn commit_picks(ctx: Context<CommitPicks>, picks: Vec<u8>) -> Result<()> {
        let entry = &mut ctx.accounts.entry;
        entry.participant = ctx.accounts.participant.key();
        entry.picks = picks;
        // TODO: set/validate entry.locked_at against the fixture kickoff (on-chain check).
        entry.locked_at = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    /// TODO(docs/DECISIONS.md#pda-seed-design-and-account-sizing): this is a
    /// placeholder sizing and a non-PDA init; replace with the decided seeds
    /// and an exact space calculation.
    #[account(
        init,
        payer = organizer,
        space = 8 + Pool::PLACEHOLDER_SPACE,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub organizer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitPicks<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    /// TODO(docs/DECISIONS.md#pda-seed-design-and-account-sizing): should be a
    /// PDA of (pool, participant) so each participant has exactly one entry.
    #[account(
        init,
        payer = participant,
        space = 8 + Entry::PLACEHOLDER_SPACE,
    )]
    pub entry: Account<'info, Entry>,

    #[account(mut)]
    pub participant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// A prediction pool created by an organizer.
#[account]
pub struct Pool {
    pub organizer: Pubkey,
    pub name: String,
    // TODO(docs/DECISIONS.md): tournament reference + scoring config fields.
}

impl Pool {
    /// TODO(docs/DECISIONS.md#pda-seed-design-and-account-sizing): placeholder.
    pub const PLACEHOLDER_SPACE: usize = 32 + 4 + POOL_NAME_MAX_LEN;
}

/// One participant's committed picks in a pool.
#[account]
pub struct Entry {
    pub participant: Pubkey,
    /// Opaque pick blob. TODO(docs/DECISIONS.md#pick-data-model): real encoding.
    pub picks: Vec<u8>,
    /// Kickoff-lock field. TODO(docs/DECISIONS.md#kickoff-lock-source): semantics
    /// (per-fixture lock vs single timestamp) and enforcement.
    pub locked_at: i64,
}

impl Entry {
    /// TODO(docs/DECISIONS.md#pda-seed-design-and-account-sizing): placeholder.
    pub const PLACEHOLDER_SPACE: usize = 32 + 4 + PICKS_PLACEHOLDER_LEN + 8;
}
