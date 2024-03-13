const Web3 = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const idl = require("./remitano.json");
const Dotenv = require("Dotenv");
Dotenv.config();

const programId = new Web3.PublicKey(
	"4pUWBrXKX1JXQv5fdn76LTGfYjvJqHzkPKxf3it86JPS"
);
const program = new anchor.Program(idl, programId);

async function main() {
	// check arguments: token and amount
	if (process.argv.length != 5) {
		console.log("Usage: yarn swap <token> <amount> <moveTokenAccount>");
		process.exit(1);
	}
	const token = process.argv[2];
	let amount;

	// check token
	if (token != "sol" && token != "move") {
		console.log("Only sol and move are supported");
		process.exit(1);
	}

	// check amount
	if (
		isNaN(parseFloat(process.argv[3])) ||
		parseFloat(process.argv[3]) <= 0
	) {
		console.log("Invalid amount");
		process.exit(1);
	}

	amount = parseFloat(process.argv[3]) * Math.pow(10, 9);

	const payer = initializeKeypair();
	const connection = new Web3.Connection(Web3.clusterApiUrl("devnet"));

	let moveToken = new Web3.PublicKey(
		"CLnitJ46dmqSi181CQgus9s94fxEufNfJ6gzgpxvxqvA"
	);

	userMove = new Web3.PublicKey(process.argv[4]);
	console.log("userMove: ", userMove.toBase58());

	let [poolState, poolState_b] = anchor.web3.PublicKey.findProgramAddressSync(
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

	let [poolMint, poolMint_b] = anchor.web3.PublicKey.findProgramAddressSync(
		[Buffer.from("pool_mint"), poolState.toBuffer()],
		program.programId
	);

	if (token == "sol") {
		await swapSolToMove(
			connection,
			amount,
			payer,
			userMove,
			poolState,
			poolAuthority,
			vault0,
			vault1,
			poolMint
		);
	} else if (token == "move") {
		await swapMoveToSol(
			connection,
			amount,
			payer,
			userMove,
			poolState,
			poolAuthority,
			vault0,
			vault1,
			poolMint
		);
	}
}

function initializeKeypair() {
	return anchor.Wallet.local().payer;
}

async function swapSolToMove(
	connection,
	amount,
	payer,
	userMove,
	poolState,
	poolAuthority,
	vault0,
	vault1,
	poolMint
) {
	program.provider.connection = connection;
	await program.rpc.swapSolForMove(new anchor.BN(amount), {
		accounts: {
			userSol: payer.publicKey,
			userMove,
			owner: payer.publicKey,
			poolState: poolState,
			poolAuthority: poolAuthority,
			vault0: vault0,
			vault1: vault1,
			poolMint: poolMint,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: Web3.SystemProgram.programId,
			rent: Web3.SYSVAR_RENT_PUBKEY,
		},
		signers: [payer],
	});
}

async function swapMoveToSol(
	connection,
	amount,
	payer,
	userMove,
	poolState,
	poolAuthority,
	vault0,
	vault1,
	poolMint
) {
	program.provider.connection = connection;
	await program.rpc.swapMoveForSol(new anchor.BN(amount), {
		accounts: {
			userMove,
			userSol: payer.publicKey,
			owner: payer.publicKey,
			poolState: poolState,
			poolAuthority: poolAuthority,
			vault0: vault0,
			vault1: vault1,
			poolMint: poolMint,
			tokenProgram: TOKEN_PROGRAM_ID,
			systemProgram: Web3.SystemProgram.programId,
			rent: Web3.SYSVAR_RENT_PUBKEY,
		},
		signers: [payer],
	});
}

main()
	.then(() => {
		console.log("Finished successfully");
	})
	.catch((error) => {
		console.error(error);
	});
