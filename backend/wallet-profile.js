const { Interface, getAddress } = require('ethers');
const { authenticatedWalletRecipient } = require('./wallet-auth-policy');
const { getWelcomeBinding } = require('./world-id');
const claimInterface = new Interface(['event Claimed(bytes32 indexed identityNullifier, address indexed recipient, uint256 amount)']);

function validateWelcomeReceipt(receipt, contract, wallet) {
  if (!receipt || receipt.status !== 1) throw new Error('Welcome reward transaction is not confirmed');
  const matched = receipt.logs.some(log => {
    if (String(log.address).toLowerCase() !== contract.toLowerCase()) return false;
    try {
      const event = claimInterface.parseLog(log);
      return event?.name === 'Claimed' && getAddress(event.args.recipient) === getAddress(wallet) && event.args.amount === 100n * 10n ** 18n;
    } catch { return false; }
  });
  if (!matched) throw new Error('No welcome reward payment to this wallet was found');
}

function registerWalletProfileRoutes(app, admin, provider, contract, requireAuthenticatedUser, pool) {
  const wallet = req => authenticatedWalletRecipient(req.authUser, req.authUser.wallet_address);
  app.get('/api/auth/profile', requireAuthenticatedUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const address = wallet(req);
      const ref = admin.firestore().collection('users').doc(req.authUser.uid);
      const profile = await admin.firestore().runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists) return snapshot.data();
        const value = { uid: req.authUser.uid, walletAddress: address, email: req.authUser.email || null,
          displayName: 'Challenger', photoURL: null, points: 0, level: 1, onboardingClaimed: false,
          onboardingClaimPendingHash: null, createdAt: admin.firestore.FieldValue.serverTimestamp() };
        tx.set(ref, value);
        return value;
      });
      const worldIdVerified = Boolean(await getWelcomeBinding(pool, address));
      return res.json({ success: true, data: { ...profile, worldIdVerified } });
    } catch { return res.status(403).json({ error: 'Profile unavailable; please sign in with your wallet again' }); }
  });
  app.post('/api/auth/onboarding-pending', requireAuthenticatedUser, async (req, res) => {
    try {
      wallet(req);
      const hash = req.body?.userOpHash;
      if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return res.status(400).json({ error: 'Invalid operation hash' });
      await admin.firestore().collection('users').doc(req.authUser.uid).set({ onboardingClaimPendingHash: hash,
        onboardingClaimPendingAt: new Date().toISOString() }, { merge: true });
      return res.json({ success: true });
    } catch { return res.status(503).json({ error: 'Unable to save the pending reward' }); }
  });
  app.post('/api/auth/onboarding-confirm', requireAuthenticatedUser, async (req, res) => {
    try {
      const address = wallet(req);
      const hash = req.body?.transactionHash;
      if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return res.status(400).json({ error: 'Invalid transaction hash' });
      if (Number((await provider.getNetwork()).chainId) !== 480) throw new Error('Unexpected chain');
      validateWelcomeReceipt(await provider.getTransactionReceipt(hash), contract, address);
      const ref = admin.firestore().collection('users').doc(req.authUser.uid);
      await admin.firestore().runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        tx.set(ref, { points: Math.max(Number(snapshot.data()?.points) || 0, 100), onboardingClaimed: true,
          onboardingClaimPendingHash: null, onboardingClaimPendingAt: null, onboardingClaimTxHash: hash }, { merge: true });
      });
      return res.json({ success: true });
    } catch { return res.status(400).json({ error: 'Welcome reward confirmation failed' }); }
  });
}

module.exports = { validateWelcomeReceipt, registerWalletProfileRoutes };
