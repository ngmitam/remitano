use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};



declare_id!("E1CRjpkK9JyHhNvSFeVy1BgQSJx1CPZQuGfnrXR8Sbs2");

pub const RATE : u64 = 10;

#[program]
pub mod remitano {
    use super::*;

    #[error_code]
    pub enum ErrorCode {
        #[msg("Pool is already initialized")]
        PoolAlreadyInitialized,
    }

    // set up the pool SOL <-> MOVE
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // check if the pool is already initialized
        let pool_state=  &mut  ctx.accounts.pool_state;
        if pool_state.is_initialized {
            return Err(ErrorCode::PoolAlreadyInitialized.into());
        }

        // initialize the pool
        pool_state.is_initialized = true;
        Ok(())
    }
}

#[account]
#[derive()] 
pub struct PoolState {
    pub is_initialized: bool,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    pub move_token: Account<'info, Mint>,
    #[account(
        init,
        space = 8 + 1,
        payer=payer, 
        seeds=[b"pool_state", move_token.key().as_ref()], 
        bump,
    )]
    pub pool_state: Box<Account<'info, PoolState>>,

    #[account(seeds=[b"authority", pool_state.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub pool_authority: AccountInfo<'info>,

    // account to hold MOVE tokens
    #[account(
        init, 
        payer=payer, 
        seeds=[b"vault0", pool_state.key().as_ref()], 
        bump,
        token::mint = move_token,
        token::authority = pool_authority
    )]
    pub vault0: Box<Account<'info, TokenAccount>>, 

    // account to hold SOL tokens
    #[account(
        init,
        payer=payer,
        seeds=[b"vault1", pool_state.key().as_ref()],
        bump,
        token::mint = move_token,
        token::authority = pool_authority
    )]
    pub vault1: Box<Account<'info, TokenAccount>>,

    // account to hold the pool mint
    #[account(
        init, 
        payer=payer,
        seeds=[b"pool_mint", pool_state.key().as_ref()], 
        bump, 
        mint::decimals = 9,
        mint::authority = pool_authority
    )] 
    pub pool_mint: Box<Account<'info, Mint>>, 

    #[account(mut)]
    pub payer: Signer<'info>,

    // accounts required to init a new mint
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}
