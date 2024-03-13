# REMITANO

## Description

This is an Anchor contract functionality for swapping tokens on the Solana blockchain.
It supports the following functionality:

-   Swap tokens
-   Add liquidity
-   Remove liquidity

## Usage

-   Devnet: https://explorer.solana.com/address/4pUWBrXKX1JXQv5fdn76LTGfYjvJqHzkPKxf3it86JPS?cluster=devnet
    It supports swapping between sol and move token (https://explorer.solana.com/address/CLnitJ46dmqSi181CQgus9s94fxEufNfJ6gzgpxvxqvA?cluster=devnet)

### How to swap tokens

```bash
yarn swap <token> <amount> <moveTokenAccount>
```

-   token: The token used to swap
-   amount: The amount of token to swap
-   moveTokenAccount: The account to send/receive the move token

Example:

```bash
yarn swap sol 0.001 36eHekjRz2cQuE9vqYohGpXRnDBN839eRPCayAsFRVz4
```

```bash
yarn swap move 0.01 36eHekjRz2cQuE9vqYohGpXRnDBN839eRPCayAsFRVz4
```

-   requires the user have set path to the anchor wallet

```
ANCHOR_WALLET=/Users/ngmitam/.config/solana/id.json
```
