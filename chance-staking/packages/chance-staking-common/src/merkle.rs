use sha2::{Digest, Sha256};

/// Compute the leaf hash for a Merkle tree entry.
///
/// M-02 FIX: Added domain separation prefix (0x00) to distinguish leaf hashes from internal nodes.
/// `leaf_hash = sha256( 0x00 || address_bytes || cumulative_start_u128_be || cumulative_end_u128_be )`
///
/// The address is the raw bech32 string bytes (not decoded).
/// cumulative_start and cumulative_end are big-endian u128 (16 bytes each).
pub fn compute_leaf_hash(address: &str, cumulative_start: u128, cumulative_end: u128) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([0x00]); // M-02 FIX: Leaf prefix
    hasher.update(address.as_bytes());
    hasher.update(cumulative_start.to_be_bytes());
    hasher.update(cumulative_end.to_be_bytes());
    hasher.finalize().into()
}

/// Verify a Merkle proof against a known root.
///
/// Uses sorted-pair hashing: for each sibling in the proof,
/// if current <= sibling then hash(current || sibling), else hash(sibling || current).
///
/// All values are 32-byte hashes represented as hex strings.
///
/// Returns true if the computed root matches the expected root.
pub fn verify_merkle_proof(root_hex: &str, proof_hex: &[String], leaf_hash: &[u8; 32]) -> bool {
    let expected_root = match hex::decode(root_hex) {
        Ok(v) => v,
        Err(_) => return false,
    };
    if expected_root.len() != 32 {
        return false;
    }

    let mut current = *leaf_hash;

    for sibling_hex in proof_hex {
        let sibling = match hex::decode(sibling_hex) {
            Ok(v) => v,
            Err(_) => return false,
        };
        if sibling.len() != 32 {
            return false;
        }

        let mut hasher = Sha256::new();
        // M-02 FIX: Internal node prefix for domain separation
        hasher.update([0x01]);
        // Sorted pair hashing: smaller value first
        if current.as_slice() <= sibling.as_slice() {
            hasher.update(current);
            hasher.update(&sibling);
        } else {
            hasher.update(&sibling);
            hasher.update(current);
        }
        current = hasher.finalize().into();
    }

    current.as_slice() == expected_root.as_slice()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_leaf_hash() {
        let hash1 = compute_leaf_hash("inj1abc", 0, 100);
        let hash2 = compute_leaf_hash("inj1abc", 0, 100);
        // Deterministic
        assert_eq!(hash1, hash2);

        // Different inputs produce different hashes
        let hash3 = compute_leaf_hash("inj1abc", 0, 200);
        assert_ne!(hash1, hash3);

        let hash4 = compute_leaf_hash("inj1def", 0, 100);
        assert_ne!(hash1, hash4);
    }

    #[test]
    fn test_verify_merkle_proof_valid() {
        // Build a small tree with 4 leaves
        let leaf_a = compute_leaf_hash("inj1aaa", 0, 100);
        let leaf_b = compute_leaf_hash("inj1bbb", 100, 350);
        let leaf_c = compute_leaf_hash("inj1ccc", 350, 400);
        let leaf_d = compute_leaf_hash("inj1ddd", 400, 500);

        // Level 1: hash pairs
        let node_ab = sorted_hash(&leaf_a, &leaf_b);
        let node_cd = sorted_hash(&leaf_c, &leaf_d);

        // Root
        let root = sorted_hash(&node_ab, &node_cd);
        let root_hex = hex::encode(root);

        // Proof for leaf_a: [leaf_b, node_cd]
        let proof = vec![hex::encode(leaf_b), hex::encode(node_cd)];
        assert!(verify_merkle_proof(&root_hex, &proof, &leaf_a));

        // Proof for leaf_c: [leaf_d, node_ab]
        let proof_c = vec![hex::encode(leaf_d), hex::encode(node_ab)];
        assert!(verify_merkle_proof(&root_hex, &proof_c, &leaf_c));
    }

    #[test]
    fn test_verify_merkle_proof_invalid() {
        let leaf_a = compute_leaf_hash("inj1aaa", 0, 100);
        let leaf_b = compute_leaf_hash("inj1bbb", 100, 350);
        let leaf_c = compute_leaf_hash("inj1ccc", 350, 400);
        let leaf_d = compute_leaf_hash("inj1ddd", 400, 500);

        let node_ab = sorted_hash(&leaf_a, &leaf_b);
        let node_cd = sorted_hash(&leaf_c, &leaf_d);
        let root = sorted_hash(&node_ab, &node_cd);
        let root_hex = hex::encode(root);

        // Tampered proof: use leaf_c instead of leaf_b as sibling
        let bad_proof = vec![hex::encode(leaf_c), hex::encode(node_cd)];
        assert!(!verify_merkle_proof(&root_hex, &bad_proof, &leaf_a));
    }

    #[test]
    fn test_verify_merkle_proof_wrong_root() {
        let leaf_a = compute_leaf_hash("inj1aaa", 0, 100);
        let leaf_b = compute_leaf_hash("inj1bbb", 100, 350);

        let node_ab = sorted_hash(&leaf_a, &leaf_b);
        let root_hex = hex::encode(node_ab);

        let proof = vec![hex::encode(leaf_b)];
        assert!(verify_merkle_proof(&root_hex, &proof, &leaf_a));

        // Wrong root
        let wrong_root = hex::encode([0u8; 32]);
        assert!(!verify_merkle_proof(&wrong_root, &proof, &leaf_a));
    }

    #[test]
    fn test_single_leaf_tree() {
        let leaf = compute_leaf_hash("inj1only", 0, 1000);
        let root_hex = hex::encode(leaf);

        // Empty proof: leaf IS the root
        let proof: Vec<String> = vec![];
        assert!(verify_merkle_proof(&root_hex, &proof, &leaf));
    }

    fn sorted_hash(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update([0x01]); // M-02 FIX: Internal node prefix
        if a.as_slice() <= b.as_slice() {
            hasher.update(a);
            hasher.update(b);
        } else {
            hasher.update(b);
            hasher.update(a);
        }
        hasher.finalize().into()
    }
}
