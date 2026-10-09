require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const app = express();
app.use(express.json({ limit: "4kb" }));

const rpcUrl =
  process.env.SOLANA_RPC || "https://api.devnet.solana.com";

const connection = new Connection(rpcUrl, "confirmed");

if (!process.env.PROGRAM_ID) {
  throw new Error("PROGRAM_ID environment variable is missing.");
}

const programId = new PublicKey(process.env.PROGRAM_ID);

// Render: set WALLET_PATH=/etc/secrets/wallet.json
// Laptop: set WALLET_PATH=./wallet.json
const walletPath = path.resolve(
  __dirname,
  process.env.WALLET_PATH || "wallet.json"
);

const secret = JSON.parse(
  fs.readFileSync(walletPath, "utf8")
);

if (
  !Array.isArray(secret) ||
  secret.length !== 64 ||
  !secret.every(Number.isInteger) ||
  secret.some((value) => value < 0 || value > 255)
) {
  throw new Error(
    "wallet.json must contain a 64-byte keypair array."
  );
}

const wallet = Keypair.fromSecretKey(
  Uint8Array.from(secret)
);

const recordDiscriminator = createHash("sha256")
  .update("account:EnergyRecord")
  .digest()
  .subarray(0, 8);

// Encode text for the Rust program.
function encodeString(value) {
  const text = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);

  length.writeUInt32LE(text.length);

  return Buffer.concat([length, text]);
}

// Identify accounts containing our energy records.
function isEnergyRecord(account) {
  return (
    account.owner.equals(programId) &&
    account.data.length >= 8 &&
    account.data
      .subarray(0, 8)
      .equals(recordDiscriminator)
  );
}

// Decode an energy record.
function decodeRecord(address, account) {
  if (!isEnergyRecord(account)) {
    throw new Error(
      "This account is not an energy record from our program."
    );
  }

  const data = account.data;
  let offset = 8;

  function readString(maxBytes) {
    if (offset + 4 > data.length) {
      throw new Error("Incomplete record.");
    }

    const length = data.readUInt32LE(offset);
    offset += 4;

    if (
      length > maxBytes ||
      offset + length > data.length
    ) {
      throw new Error("Invalid record string.");
    }

    const value = data
      .subarray(offset, offset + length)
      .toString("utf8");

    offset += length;
    return value;
  }

  const meterId = readString(32);
  const date = readString(10);

  if (offset + 48 > data.length) {
    throw new Error("Incomplete energy record.");
  }

  const energyWh = data.readBigUInt64LE(offset);
  offset += 8;

  const owner = new PublicKey(
    data.subarray(offset, offset + 32)
  );
  offset += 32;

  const timestamp = data.readBigInt64LE(offset);

  return {
    recordAddress: address.toBase58(),
    meterId,
    date,
    energyWh: energyWh.toString(),
    owner: owner.toBase58(),
    timestamp: timestamp.toString(),
  };
}

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(value + "T00:00:00Z");

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

// Home page.
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Smart Energy Solana Backend",
    endpoints: {
      health: "GET /health",
      readiness: "GET /ready",
      submitEnergy: "POST /energy",
      listEnergy: "GET /energy",
      readEnergy: "GET /energy/:address",
    },
  });
});

// Lightweight endpoint for Render health checks.
// Does not make a Solana RPC request.
app.get("/ready", (req, res) => {
  res.json({
    success: true,
    message: "Server is running.",
  });
});

// Check Solana connection, wallet balance, and program.
app.get("/health", async (req, res) => {
  try {
    const balance = await connection.getBalance(
      wallet.publicKey
    );

    const program = await connection.getAccountInfo(
      programId
    );

    res.json({
      success: true,
      wallet: wallet.publicKey.toBase58(),
      balanceSol: balance / LAMPORTS_PER_SOL,
      programId: programId.toBase58(),
      programDeployed: Boolean(
        program && program.executable
      ),
    });
  } catch (error) {
    console.error("Health check error:", error.message);

    res.status(502).json({
      success: false,
      error: error.message,
    });
  }
});

// Store an energy reading.
app.post("/energy", async (req, res) => {
  const { meterId, date, energyWh } = req.body || {};

  if (
    typeof meterId !== "string" ||
    meterId.trim().length === 0 ||
    Buffer.byteLength(meterId, "utf8") > 32
  ) {
    return res.status(400).json({
      success: false,
      error: "meterId must contain 1–32 bytes.",
    });
  }

  if (!isValidDate(date)) {
    return res.status(400).json({
      success: false,
      error: "date must be a valid YYYY-MM-DD date.",
    });
  }

  if (
    !Number.isSafeInteger(energyWh) ||
    energyWh < 0
  ) {
    return res.status(400).json({
      success: false,
      error:
        "energyWh must be a non-negative whole number.",
    });
  }

  try {
    const record = Keypair.generate();

    const discriminator = createHash("sha256")
      .update("global:submit_energy")
      .digest()
      .subarray(0, 8);

    const energyBuffer = Buffer.alloc(8);
    energyBuffer.writeBigUInt64LE(BigInt(energyWh));

    const data = Buffer.concat([
      discriminator,
      encodeString(meterId),
      encodeString(date),
      energyBuffer,
    ]);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        {
          pubkey: record.publicKey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: wallet.publicKey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      data,
    });

    const transaction = new Transaction().add(
      instruction
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet, record],
      { commitment: "confirmed" }
    );

    res.status(201).json({
      success: true,
      meterId,
      date,
      energyWh,
      recordAddress: record.publicKey.toBase58(),
      signature,
      explorer:
        `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (error) {
    console.error("Submission error:", error.message);

    res.status(502).json({
      success: false,
      error: error.message,
    });
  }
});

// List all energy records.
app.get("/energy", async (req, res) => {
  try {
    const accounts =
      await connection.getProgramAccounts(programId);

    const records = accounts
      .filter(({ account }) => isEnergyRecord(account))
      .map(({ pubkey, account }) =>
        decodeRecord(pubkey, account)
      );

    records.sort((a, b) => {
      const first = BigInt(a.timestamp);
      const second = BigInt(b.timestamp);

      return first > second ? -1 : first < second ? 1 : 0;
    });

    res.json({
      success: true,
      count: records.length,
      records,
    });
  } catch (error) {
    console.error("List records error:", error.message);

    res.status(502).json({
      success: false,
      error: error.message,
    });
  }
});

// Read one energy record.
app.get("/energy/:address", async (req, res) => {
  let address;

  try {
    address = new PublicKey(req.params.address);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Invalid record address.",
    });
  }

  try {
    const account = await connection.getAccountInfo(
      address
    );

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Record not found.",
      });
    }

    if (!isEnergyRecord(account)) {
      return res.status(400).json({
        success: false,
        error:
          "This address is not an energy record from our program.",
      });
    }

    res.json({
      success: true,
      ...decodeRecord(address, account),
    });
  } catch (error) {
    console.error("Read record error:", error.message);

    res.status(502).json({
      success: false,
      error: error.message,
    });
  }
});

// Return JSON for unknown routes.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found.",
  });
});

// Handle malformed JSON and other Express errors.
app.use((error, req, res, next) => {
  const status =
    error.type === "entity.parse.failed"
      ? 400
      : error.type === "entity.too.large"
        ? 413
        : 500;

  res.status(status).json({
    success: false,
    error:
      status === 400
        ? "Invalid JSON request body."
        : status === 413
          ? "Request body is too large."
          : "Internal server error.",
  });
});

const port = Number(process.env.PORT || 3000);

// Render needs 0.0.0.0 and its assigned PORT.
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Program: ${programId.toBase58()}`);
});