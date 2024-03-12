import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Remitano } from "../target/types/remitano";
import * as token from "@solana/spl-token";

describe("remitano", () => {
	// Configure the client to use the local cluster.
	let provider = anchor.AnchorProvider.env();
	let connection = provider.connection;
	anchor.setProvider(provider);

	const program = anchor.workspace.Remitano as Program<Remitano>;

	let pool;
	let n_decimals = 9;

	it("Is initialized!", async () => {
		let auth = anchor.web3.Keypair.generate();
		let sig = await connection.requestAirdrop(
			auth.publicKey,
			100 * anchor.web3.LAMPORTS_PER_SOL
		);
		await connection.confirmTransaction(sig);

		let moveToken = await token.createMint(
			connection,
			auth,
			auth.publicKey,
			auth.publicKey,
			n_decimals
		);

		let [poolState, poolState_b] =
			anchor.web3.PublicKey.findProgramAddressSync(
				[Buffer.from("pool_state"), moveToken.toBuffer()],
				program.programId
			);

		let [poolAuthority, poolAuthority_b] =
			anchor.web3.PublicKey.findProgramAddressSync(
				[Buffer.from("authority"), poolState.toBuffer()],
				program.programId
			);

		let [vault0, vault0_b] = anchor.web3.PublicKey.findProgramAddressSync(
			[Buffer.from("vault0"), poolState.toBuffer()],
			program.programId
		);

		let [vault1, vault1_b] = anchor.web3.PublicKey.findProgramAddressSync(
			[Buffer.from("vault1"), poolState.toBuffer()],
			program.programId
		);

		let [poolMint, poolMint_b] =
			anchor.web3.PublicKey.findProgramAddressSync(
				[Buffer.from("pool_mint"), poolState.toBuffer()],
				program.programId
			);

		await program.rpc
			.initialize({
				accounts: {
					moveToken,
					poolState,
					poolAuthority,
					vault0,
					vault1,
					poolMint,
					payer: auth.publicKey,
					systemProgram: anchor.web3.SystemProgram.programId,
					tokenProgram: token.TOKEN_PROGRAM_ID,
					associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
					rent: anchor.web3.SYSVAR_RENT_PUBKEY,
				},
				signers: [auth],
			})
			.catch((err) => {
				console.log(err);
			});

		pool = {
			moveToken,
			poolState,
			poolAuthority,
			vault0,
			vault1,
			poolMint,
			auth,
		};
	});
});
