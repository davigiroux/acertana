/**
 * Build-time shim for Privy's OPTIONAL peer deps `@solana/kit` and
 * `@solana-program/system` (aliased in vite.config.ts).
 *
 * This stack is pinned to `@solana/web3.js` (see docs/BUILD_LOG.md) and must
 * NOT install `@solana/kit`. Privy v2 only imports these symbols inside its
 * funding / kit-interop features, which Acertana never uses — but the bundler
 * still needs the named exports to exist. Each one throws if actually called.
 *
 * The export list is the full set of symbols Privy 2.25.0 imports from the two
 * packages; re-derive it after a Privy upgrade with:
 *   grep -rhoE "import\s*\{[^}]*\}\s*from\s*['\"](@solana/kit|@solana-program/system)['\"]" \
 *     node_modules/@privy-io/react-auth/dist/esm/*.mjs
 */
function unavailable(name: string) {
  return (..._args: unknown[]): never => {
    throw new Error(
      `${name} is unavailable: @solana/kit is intentionally not installed (see docs/BUILD_LOG.md)`,
    );
  };
}

export const address = unavailable('address');
export const appendTransactionMessageInstruction = unavailable('appendTransactionMessageInstruction');
export const compileTransaction = unavailable('compileTransaction');
export const createTransactionMessage = unavailable('createTransactionMessage');
export const decompileTransactionMessage = unavailable('decompileTransactionMessage');
export const fetchAddressesForLookupTables = unavailable('fetchAddressesForLookupTables');
export const getBase58Decoder = unavailable('getBase58Decoder');
export const getBase58Encoder = unavailable('getBase58Encoder');
export const getBase64Decoder = unavailable('getBase64Decoder');
export const getCompiledTransactionMessageDecoder = unavailable('getCompiledTransactionMessageDecoder');
export const getTransactionDecoder = unavailable('getTransactionDecoder');
export const getTransactionEncoder = unavailable('getTransactionEncoder');
export const getTransferSolInstruction = unavailable('getTransferSolInstruction');
export const pipe = unavailable('pipe');
export const setTransactionMessageFeePayerSigner = unavailable('setTransactionMessageFeePayerSigner');
export const setTransactionMessageLifetimeUsingBlockhash = unavailable('setTransactionMessageLifetimeUsingBlockhash');
export const findAssociatedTokenPda = unavailable('findAssociatedTokenPda');
export const getCreateAssociatedTokenIdempotentInstruction = unavailable('getCreateAssociatedTokenIdempotentInstruction');
export const getTransferInstruction = unavailable('getTransferInstruction');
