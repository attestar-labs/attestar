import { Networks } from "@creit.tech/stellar-wallets-kit";

// Map the configured network passphrase onto the Stellar Wallets Kit network.
// The kit and the signed transaction must agree on the network, otherwise the
// extension signs for the wrong chain and the contract rejects with tx_bad_auth.
const NETWORK_BY_PASSPHRASE: Record<string, Networks> = {
  "Public Global Stellar Network ; September 2015": Networks.PUBLIC,
  "Test SDF Network ; September 2015": Networks.TESTNET,
};

export function networkForPassphrase(passphrase: string): Networks {
  const network = NETWORK_BY_PASSPHRASE[passphrase];
  if (!network) {
    throw new Error(
      `Unknown Stellar network passphrase: "${passphrase}". ` +
        "Set NEXT_PUBLIC_NETWORK_PASSPHRASE to the public or testnet passphrase.",
    );
  }
  return network;
}
