use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

declare_id!("ASk79fYt7bfuJUcXFJb4eirRYoVio43ciVgq2qKWrVpi");

pub const RATE : u64 = 10;

#[program]
pub mod remitano {
    use anchor_spl::token;
    use spl_token::solana_program::system_instruction;

    use super::*;

    #[error_code]
    pub enum ErrorCode {
        #[msg("Pool is already initialized")]
        PoolAlreadyInitialized,
        #[msg("Pool is not initialized")]
        PoolNotInitialized,
        #[msg("Invalid rate")]
        InvalidRate,
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

    // add liquidity to the pool
    pub fn add_liquidity(ctx: Context<AddLiquidity>, sol_amount: u64, move_amount: u64) -> Result<()> {

        // get the pool mint
        let pool_mint = &ctx.accounts.pool_mint;

        // get the pool vaults
        let vault0 = &ctx.accounts.vault0;
        let vault1 = &ctx.accounts.vault1;

        // get the pool state
        let pool_state = &ctx.accounts.pool_state;

        // calculate the amount of pool tokens to mint
        // pool_tokens = sol_amount = move_amount / RATE
        let pool_tokens = sol_amount;

        // check if the pool is already initialized
        if !pool_state.is_initialized {
            return Err(ErrorCode::PoolNotInitialized.into());
        }

        // mint the pool tokens
        let bump= ctx.bumps.pool_authority;
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: pool_mint.to_account_info(),
                    to: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
            ).with_signer(&[
                &[b"authority", pool_state.key().as_ref(),&[bump]],
            ]),
            pool_tokens,
        )?;

        // deposit the SOL tokens
        anchor_lang::solana_program::program::invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.user_sol.to_account_info().key,
                vault1.to_account_info().key,
                sol_amount,
            ),
            &[
                ctx.accounts.user_sol.to_account_info(),
                vault1.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        // deposit the MOVE tokens
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_move.to_account_info(),
                    to: vault0.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            move_amount,
        )?;

        Ok(())
    }

    // remove liquidity from the pool
    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, pool_tokens: u64) -> Result<()> {
        // get the pool mint
        let pool_mint = &ctx.accounts.pool_mint;

        // get the pool vaults
        let vault0 = &ctx.accounts.vault0;
        let vault1 = &ctx.accounts.vault1;

        // get the pool state
        let pool_state = &ctx.accounts.pool_state;

        // check if the pool is already initialized
        if !pool_state.is_initialized {
            return Err(ErrorCode::PoolNotInitialized.into());
        }

        // burn the pool tokens
        let bump= ctx.bumps.pool_authority;
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: pool_mint.to_account_info(),
                    from: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ).with_signer(&[
                &[b"authority", pool_state.key().as_ref(),&[bump]],
            ]),
            pool_tokens,
        )?;

        // withdraw the SOL tokens
        if vault1.lamports() < pool_tokens {
            return Err(ErrorCode::InvalidRate.into());
        }

        let _ = vault1.sub_lamports(pool_tokens);
        **ctx.accounts.user_sol.try_borrow_mut_lamports()? += pool_tokens;

        // withdraw the MOVE tokens
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: vault0.to_account_info(),
                    to: ctx.accounts.user_move.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
            ).with_signer(
                &[
                    &[b"authority", pool_state.key().as_ref(),&[bump]],
                ]
            
            ),
            pool_tokens * RATE,
        )?;

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
        space = 8,
        seeds=[b"vault1", pool_state.key().as_ref()],
        bump,
    )]
    /// CHECK: This is not dangerous because 
    pub vault1: AccountInfo<'info>,

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

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    /// CHECK: This is not dangerous because 
    pub user_sol: AccountInfo<'info>,
    #[account(mut, has_one=owner)]
    pub user_move: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one=owner)]
    pub user_ata: Box<Account<'info, TokenAccount>>,

    pub owner: Signer<'info>,

    #[account(mut)]
    pub pool_state: Account<'info, PoolState>,
    #[account(seeds=[b"authority", pool_state.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub pool_authority: AccountInfo<'info>,

    #[account(mut, 
        constraint = vault0.mint == user_move.mint,
        seeds=[b"vault0", pool_state.key().as_ref()], bump)]
    pub vault0: Account<'info, TokenAccount>,
    #[account(mut, 
        seeds=[b"vault1", pool_state.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because 
    pub vault1: AccountInfo<'info>,

    #[account(mut, 
        constraint = user_ata.mint == pool_mint.key(),
        seeds=[b"pool_mint", pool_state.key().as_ref()], bump)]
    pub pool_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    /// CHECK: This is not dangerous because 
    pub user_sol: AccountInfo<'info>,
    #[account(mut, has_one=owner)]
    pub user_move: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one=owner)]
    pub user_ata: Box<Account<'info, TokenAccount>>,

    pub owner: Signer<'info>,

    #[account(mut)]
    pub pool_state: Account<'info, PoolState>,
    #[account(seeds=[b"authority", pool_state.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub pool_authority: AccountInfo<'info>,

    #[account(mut, 
        constraint = vault0.mint == user_move.mint,
        seeds=[b"vault0", pool_state.key().as_ref()], bump)]
    pub vault0: Account<'info, TokenAccount>,
    #[account(mut, 
        seeds=[b"vault1", pool_state.key().as_ref()], bump)]
    /// CHECK: This is not dangerous because 
    pub vault1: AccountInfo<'info>,

    #[account(mut, 
        constraint = user_ata.mint == pool_mint.key(),
        seeds=[b"pool_mint", pool_state.key().as_ref()], bump)]
    pub pool_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

