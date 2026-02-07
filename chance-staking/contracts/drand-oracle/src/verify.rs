use drand_verify::Pubkey;
use sha2::{Digest, Sha256};

/// Quicknet public key (G2, 96 bytes) — hex encoded.
/// Network: drand quicknet (bls-unchained-g1-rfc9380)
pub const QUICKNET_PK_HEX: &str = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";

/// Errors from BLS verification.
#[derive(Debug)]
pub enum VerifyError {
    InvalidPubkeyLength,
    InvalidPubkey,
    VerificationFailed(String),
    InvalidSignature,
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VerifyError::InvalidPubkeyLength => write!(f, "invalid pubkey length (expected 96 bytes)"),
            VerifyError::InvalidPubkey => write!(f, "invalid pubkey (failed to parse G2 point)"),
            VerifyError::VerificationFailed(msg) => write!(f, "verification failed: {}", msg),
            VerifyError::InvalidSignature => write!(f, "invalid BLS signature"),
        }
    }
}

/// Verify a quicknet drand beacon and derive randomness.
///
/// Returns 32-byte randomness = sha256(signature) on success.
///
/// Uses drand-verify's pure-Rust BLS12-381 implementation.
/// Quicknet uses scheme bls-unchained-g1-rfc9380, so we use G2PubkeyFastnet.
pub fn verify_quicknet_beacon(
    pubkey_bytes: &[u8],
    round: u64,
    signature: &[u8],
) -> Result<[u8; 32], VerifyError> {
    // Parse public key — must be exactly 96 bytes (G2 compressed)
    let pk_fixed: [u8; 96] = pubkey_bytes
        .try_into()
        .map_err(|_| VerifyError::InvalidPubkeyLength)?;

    // Use G2PubkeyRfc for quicknet (bls-unchained-g1-rfc9380)
    // The Pubkey trait must be in scope to call from_fixed()
    let pk = drand_verify::G2PubkeyRfc::from_fixed(pk_fixed)
        .map_err(|_| VerifyError::InvalidPubkey)?;

    // Quicknet is unchained: previous_signature is empty
    let is_valid = pk
        .verify(round, &[], signature)
        .map_err(|e| VerifyError::VerificationFailed(format!("{:?}", e)))?;

    if !is_valid {
        return Err(VerifyError::InvalidSignature);
    }

    // Derive randomness: sha256(signature)
    let randomness: [u8; 32] = Sha256::digest(signature).into();
    Ok(randomness)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real quicknet test vector
    const TEST_ROUND: u64 = 1000;
    const TEST_SIG_HEX: &str = "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39";
    const TEST_RANDOMNESS_HEX: &str = "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd";

    #[test]
    fn test_verify_quicknet_beacon_valid() {
        let pk_bytes = hex::decode(QUICKNET_PK_HEX).unwrap();
        let sig_bytes = hex::decode(TEST_SIG_HEX).unwrap();

        let result = verify_quicknet_beacon(&pk_bytes, TEST_ROUND, &sig_bytes);
        assert!(result.is_ok(), "Verification should succeed: {:?}", result.err());

        let randomness = result.unwrap();
        assert_eq!(hex::encode(randomness), TEST_RANDOMNESS_HEX);
    }

    #[test]
    fn test_verify_quicknet_beacon_invalid_sig() {
        let pk_bytes = hex::decode(QUICKNET_PK_HEX).unwrap();
        let mut sig_bytes = hex::decode(TEST_SIG_HEX).unwrap();
        // Tamper with signature
        sig_bytes[0] ^= 0xFF;

        let result = verify_quicknet_beacon(&pk_bytes, TEST_ROUND, &sig_bytes);
        assert!(result.is_err(), "Tampered signature should fail verification");
    }

    #[test]
    fn test_verify_quicknet_beacon_wrong_round() {
        let pk_bytes = hex::decode(QUICKNET_PK_HEX).unwrap();
        let sig_bytes = hex::decode(TEST_SIG_HEX).unwrap();

        // Wrong round
        let result = verify_quicknet_beacon(&pk_bytes, TEST_ROUND + 1, &sig_bytes);
        assert!(result.is_err(), "Wrong round should fail verification");
    }

    #[test]
    fn test_verify_quicknet_beacon_invalid_pubkey_length() {
        let sig_bytes = hex::decode(TEST_SIG_HEX).unwrap();
        let short_pk = vec![0u8; 48]; // Too short

        let result = verify_quicknet_beacon(&short_pk, TEST_ROUND, &sig_bytes);
        assert!(matches!(result, Err(VerifyError::InvalidPubkeyLength)));
    }
}
