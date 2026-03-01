import { Router } from 'express';

/**
 * @swagger
 * tags:
 *   name: Coins
 *   description: Wallet, coin packages, store, and admin coin management
 */
import { WalletController, PackageController, StoreController, AdminController } from '../controllers/coins';
import { authenticateToken } from '../middleware/auth';

const router: Router = Router();

router.use(authenticateToken);

// Wallet routes
/**
 * @swagger
 * /coins/wallet:
 *   get:
 *     summary: Get the authenticated user's wallet
 *     tags: [Coins]
 *     responses:
 *       200:
 *         description: Wallet details
 */
router.get('/wallet', WalletController.getWallet);
/**
 * @swagger
 * /coins/wallet/transactions:
 *   get:
 *     summary: Get wallet transaction history
 *     tags: [Coins]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of transactions
 */
router.get('/wallet/transactions', WalletController.getTransactionHistory);

// Package routes
/**
 * @swagger
 * /coins/packages:
 *   get:
 *     summary: List available coin packages
 *     tags: [Coins]
 *     responses:
 *       200:
 *         description: List of packages
 */
router.get('/packages', PackageController.getPackages);
/**
 * @swagger
 * /coins/packages/order:
 *   post:
 *     summary: Create a coin package order
 *     tags: [Coins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               package_id:
 *                 type: string
 *               payment_method:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created
 */
router.post('/packages/order', PackageController.createOrder);
/**
 * @swagger
 * /coins/packages/orders:
 *   get:
 *     summary: List user's coin package orders
 *     tags: [Coins]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get('/packages/orders', PackageController.getOrders);
/**
 * @swagger
 * /coins/packages/orders/{order_id}:
 *   get:
 *     summary: Get a coin package order by ID
 *     tags: [Coins]
 *     parameters:
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Not found
 */
router.get('/packages/orders/:order_id', PackageController.getOrderById);
router.post('/packages/orders/:order_id/callback', PackageController.handlePaymentCallback);

// Store routes
router.get('/store', StoreController.getStoreItems);
router.post('/store/purchase', StoreController.purchaseItem);
router.get('/store/entitlements', StoreController.getEntitlements);
router.get('/store/entitlements/:item_type', StoreController.checkEntitlement);

// Admin routes - require admin role (to be implemented with role middleware)
router.get('/admin/platform-fees', AdminController.getPlatformFees);
router.get('/admin/platform-fees/stats', AdminController.getPlatformFeesStats);
router.get('/admin/actions', AdminController.getAdminActions);
router.get('/admin/calculate-fee', AdminController.calculateFee);

// Admin wallet management
router.post('/admin/wallet/:user_id/freeze', WalletController.freezeWallet);
router.post('/admin/wallet/:user_id/unfreeze', WalletController.unfreezeWallet);

// Admin package management
router.post('/admin/packages', PackageController.createPackage);
router.patch('/admin/packages/:package_id', PackageController.updatePackage);

// Admin store management
router.post('/admin/store', StoreController.createStoreItem);
router.patch('/admin/store/:item_id', StoreController.updateStoreItem);

export default router;