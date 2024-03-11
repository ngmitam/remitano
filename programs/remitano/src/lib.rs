use anchor_lang::prelude::*;

declare_id!("E1CRjpkK9JyHhNvSFeVy1BgQSJx1CPZQuGfnrXR8Sbs2");

#[program]
pub mod remitano {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
