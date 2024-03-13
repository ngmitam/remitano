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

	async function sendSol(
		connection: anchor.web3.Connection,
		amount: number,
		to: anchor.web3.PublicKey,
		sender: anchor.web3.Keypair
	) {
		const transaction = new anchor.web3.Transaction();

		const sendSolInstruction = anchor.web3.SystemProgram.transfer({
			fromPubkey: sender.publicKey,
			toPubkey: to,
			lamports: amount,
		});

		transaction.add(sendSolInstruction);

		const sig = await anchor.web3.sendAndConfirmTransaction(
			connection,
			transaction,
			[sender]
		);
	}

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
			await sendSol(
				connection,
				amount * anchor.web3.LAMPORTS_PER_SOL,
				userSol,
				pool.auth
			);
		}

		return [userMove, userSol, userAta];
	};

	it("initialize", async () => {
		let auth = anchor.web3.Keypair.generate();
		let sig = await connection.requestAirdrop(
			auth.publicKey,
			5 * anchor.web3.LAMPORTS_PER_SOL
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
				moveToken: moveToken,
				poolState,
				poolAuthority,
				payer: auth.publicKey,
				poolMint,
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

	it("initializePool", async () => {
		await program.rpc
			.initializePool({
				accounts: {
					poolState: pool.poolState,
					poolAuthority: pool.poolAuthority,
					vault0: pool.vault0,
					vault1: pool.vault1,
					tokenProgram: token.TOKEN_PROGRAM_ID,
					systemProgram: anchor.web3.SystemProgram.programId,
					moveToken: pool.moveToken,
					payer: pool.auth.publicKey,
					rent: anchor.web3.SYSVAR_RENT_PUBKEY,
				},
				signers: [pool.auth],
			})
			.catch((err) => {
				console.log(err);
			});
	});

	let lpUser0; // Liquidity Provider 0
	it("addLiquidity", async () => {
		let lpUser = anchor.web3.Keypair.generate();
		await sendSol(
			connection,
			0.5 * anchor.web3.LAMPORTS_PER_SOL,
			lpUser.publicKey,
			pool.auth
		);
		let [userMove, userSol, userAta] = await setupLPProvider(lpUser, 0.2);
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

		let [solAmount, moveAmount] = [LPAmount(0.05), LPAmount(0.5)];
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
		let poolAmount = LPAmount(0.04);
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

		assert(vb0 == 0.1);
	});

	it("swapSolForMove", async () => {
		let solUser = anchor.web3.Keypair.generate();
		await sendSol(
			connection,
			0.5 * anchor.web3.LAMPORTS_PER_SOL,
			solUser.publicKey,
			pool.auth
		);
		let [userMove, userSol, userAta] = await setupLPProvider(solUser, 0.2);
		assert(userMove);
		assert(userSol);
		assert(userAta);

		let solAmount = LPAmount(0.005);
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
		assert(vb0 == 0.05);
	});

	it("swapMoveForSol", async () => {
		let moveUser = anchor.web3.Keypair.generate();
		await sendSol(
			connection,
			0.5 * anchor.web3.LAMPORTS_PER_SOL,
			moveUser.publicKey,
			pool.auth
		);
		let [userMove, userSol, userAta] = await setupLPProvider(moveUser, 0.2);
		assert(userMove);
		assert(userSol);
		assert(userAta);

		let moveAmount = LPAmount(0.02);
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
		assert((vb0 = 0.1));
	});
});
