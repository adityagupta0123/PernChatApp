const { box, randomBytes } = require('tweetnacl');
const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = require('tweetnacl-util');

const validateAndDecodeKey = (key) => {
  try {
    return decodeBase64(key);
  } catch (error) {
    throw new Error('Invalid key format');
  }
};

const verifyKeyPair = (publicKey, secretKey) => {
  try {
    const decodedPublicKey = validateAndDecodeKey(publicKey);
    const decodedSecretKey = validateAndDecodeKey(secretKey);
    
    if (decodedPublicKey.length !== box.publicKeyLength) {
      throw new Error('Invalid public key length');
    }
    
    if (decodedSecretKey.length !== box.secretKeyLength) {
      throw new Error('Invalid secret key length');
    }
    
    return true;
  } catch (error) {
    throw new Error(`Key verification failed: ${error.message}`);
  }
};

const generateNonce = () => {
  return encodeBase64(randomBytes(box.nonceLength));
};

const validateEncryptedMessage = (encryptedMessage) => {
  if (!encryptedMessage || !encryptedMessage.encrypted || !encryptedMessage.nonce) {
    throw new Error('Invalid encrypted message format');
  }
  
  try {
    decodeBase64(encryptedMessage.encrypted);
    decodeBase64(encryptedMessage.nonce);
  } catch (error) {
    throw new Error('Invalid base64 encoding in encrypted message');
  }
};

module.exports = {
  verifyKeyPair,
  generateNonce,
  validateEncryptedMessage
};
