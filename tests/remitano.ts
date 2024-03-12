import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Remitano } from "../target/types/remitano";
import * as token from "@solana/spl-token";
import { assert } from "chai";

const RATE = 10; // 1 sol: 10 move

describe("remitano", () => {
	// Configure the client to use the local cluster.
	let provider = anchor.AnchorProvider.env();
	let connection = provider.connection;
	anchor.setProvider(provider);

	const program = anchor.workspace.Remitano as Program<Remitano>;

	let pool;
	let nDecimals = 9;

	let LPAmount = (amount: number) => {
		return new anchor.BN(amount * Math.pow(10, nDecimals));
	};

	let getBalance = async (ata: anchor.web3.PublicKey) => {
		return (
			(await connection.getBalance(ata)) / anchor.web3.LAMPORTS_PER_SOL
		);
	};

	let getTokenBalance = async (ata: anchor.web3.PublicKey) => {
		return (await connection.getTokenAccountBalance(ata)).value.uiAmount;
	};

	let setupLPProvider = async (
		lpUser: anchor.web3.Keypair,
		amount: number
	) => {
		let userMove = await token.createAssociatedTokenAccount(
			connection,
			lpUser,
			pool.moveToken,
			lpUser.publicKey
		);
		let userSol = lpUser.publicKey;
		let userAta = await token.createAssociatedTokenAccount(
			connection,
			lpUser,
			pool.poolMint,
			lpUser.publicKey
		);
		if (userMove && userSol) {
			await token.mintTo(
				connection,
				pool.auth,
				pool.moveToken,
				userMove,
				pool.auth,
				LPAmount(amount * RATE).toNumber()
			);

			let sig = await connection.requestAirdrop(
				userSol,
				amount * anchor.web3.LAMPORTS_PER_SOL
			);
			await connection.confirmTransaction(sig);
		}

		return [userMove, userSol, userAta];
	};

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
			nDecimals
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

		await program.rpc.initialize({
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
	let lpUser0; // Liquidity Provider 0
	it("addLiquidity", async () => {
		let lpUser = anchor.web3.Keypair.generate();
		let sig = await connection.requestAirdrop(
			lpUser.publicKey,
			100 * anchor.web3.LAMPORTS_PER_SOL
		);
		await connection.confirmTransaction(sig);
		let [userMove, userSol, userAta] = await setupLPProvider(lpUser, 1000);
		assert(userMove);
		assert(userSol);
		assert(userAta);

		lpUser0 = {
			// here
			signer: lpUser,
			userMove,
			userSol,
			userAta,
		};

		let [solAmount, moveAmount] = [LPAmount(50), LPAmount(500)];
		await program.rpc.addLiquidity(solAmount, moveAmount, {
			accounts: {
				userSol,
				userMove,
				userAta,
				owner: lpUser.publicKey,
				poolState: pool.poolState,
				poolAuthority: pool.poolAuthority,
				vault0: pool.vault0,
				vault1: pool.vault1,
				poolMint: pool.poolMint,
				tokenProgram: token.TOKEN_PROGRAM_ID,
				systemProgram: anchor.web3.SystemProgram.programId,
			},
			signers: [lpUser],
		});

		// ensure vault got some
		let vb0 = await getTokenBalance(pool.vault0);
		let vb1 = await getBalance(pool.vault1);

		assert(vb0 > 0);
		assert(vb1 > 0);
		assert(vb1 * 10 >= vb0); // 1:10
	});

	it("removeLiquidity", async () => {
		let poolAmount = LPAmount(40);
		await program.rpc.removeLiquidity(poolAmount, {
			accounts: {
				userSol: lpUser0.userSol,
				userMove: lpUser0.userMove,
				userAta: lpUser0.userAta,
				owner: lpUser0.signer.publicKey,
				poolState: pool.poolState,
				poolAuthority: pool.poolAuthority,
				vault0: pool.vault0,
				vault1: pool.vault1,
				poolMint: pool.poolMint,
				tokenProgram: token.TOKEN_PROGRAM_ID,
				systemProgram: anchor.web3.SystemProgram.programId,
			},
			signers: [lpUser0.signer],
		});

		// ensure vault got some
		let vb0 = await getTokenBalance(pool.vault0);
		let vb1 = await getBalance(pool.vault1);

		assert(vb0 == 100);
		assert(Math.round(vb1) == 10);
	});

	it("swapSolForMove", async () => {
		let solUser = anchor.web3.Keypair.generate();
		let sig = await connection.requestAirdrop(
			solUser.publicKey,
			100 * anchor.web3.LAMPORTS_PER_SOL
		);
		await connection.confirmTransaction(sig);
		let [userMove, userSol, userAta] = await setupLPProvider(solUser, 100);
		assert(userMove);
		assert(userSol);
		assert(userAta);

		let solAmount = LPAmount(2);
		await program.rpc.swapSolForMove(solAmount, {
			accounts: {
				userSol,
				userMove,
				owner: solUser.publicKey,
				poolState: pool.poolState,
				poolAuthority: pool.poolAuthority,
				vault0: pool.vault0,
				vault1: pool.vault1,
				tokenProgram: token.TOKEN_PROGRAM_ID,
				systemProgram: anchor.web3.SystemProgram.programId,
			},
			signers: [solUser],
		});

		// ensure vault got some
		let vb0 = await getTokenBalance(pool.vault0);
		let vb1 = await getBalance(pool.vault1);

		assert(vb0 > 0);
		assert(vb1 > 0);
		assert((vb0 = 80));
		assert(Math.round(vb1) == 12);
	});

	it("swapMoveForSol", async () => {
		let moveUser = anchor.web3.Keypair.generate();
		let sig = await connection.requestAirdrop(
			moveUser.publicKey,
			100 * anchor.web3.LAMPORTS_PER_SOL
		);
		await connection.confirmTransaction(sig);
		let [userMove, userSol, userAta] = await setupLPProvider(moveUser, 100);
		assert(userMove);
		assert(userSol);
		assert(userAta);

		let moveAmount = LPAmount(20);
		await program.rpc.swapMoveForSol(moveAmount, {
			accounts: {
				userSol,
				userMove,
				owner: moveUser.publicKey,
				poolState: pool.poolState,
				poolAuthority: pool.poolAuthority,
				vault0: pool.vault0,
				vault1: pool.vault1,
				tokenProgram: token.TOKEN_PROGRAM_ID,
				systemProgram: anchor.web3.SystemProgram.programId,
			},
			signers: [moveUser],
		});

		// ensure vault got some
		let vb0 = await getTokenBalance(pool.vault0);
		let vb1 = await getBalance(pool.vault1);

		assert(vb0 > 0);
		assert(vb1 > 0);
		assert((vb0 = 100));
		assert(Math.round(vb1) == 10);
	});
});
