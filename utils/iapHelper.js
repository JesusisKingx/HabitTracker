import * as RNIap from 'react-native-iap';
import { Platform } from 'react-native';
import { APPLE_IAP_SHARED_SECRET } from '@env';

// Log shared secret availability (remove in production)
console.log(
  '🔐 [IAP] Shared secret loaded:',
  APPLE_IAP_SHARED_SECRET ? 'Yes' : 'No'
);

const productIds = [
  'habittracker.premium.monthly.v2',
  'habittracker.premium.yearly',
];

const IAP = {
  init: async () => {
    try {
      const result = await RNIap.initConnection();
      console.log('✅ [IAP] Connected:', result);
      return result;
    } catch (error) {
      console.log('❌ [IAP] initConnection error:', error);
    }
  },

  getProducts: async () => {
    try {
      const products = await RNIap.getSubscriptions(productIds);
      console.log('🛒 [IAP] Products:', products);
      return products;
    } catch (error) {
      console.log('❌ [IAP] getSubscriptions error:', error);
      return [];
    }
  },

  purchase: async productId => {
    try {
      await RNIap.requestSubscription(productId);
    } catch (error) {
      console.log('❌ [IAP] Purchase error:', error);
    }
  },

  getPurchaseHistory: async () => {
    try {
      const history = await RNIap.getAvailablePurchases();
      console.log('📜 [IAP] Purchase history:', history);
      return history;
    } catch (error) {
      console.log('❌ [IAP] Purchase history error:', error);
      return [];
    }
  },

  finish: async purchase => {
    try {
      await RNIap.finishTransaction(purchase, false);
      console.log('✅ [IAP] Finished transaction');
    } catch (error) {
      console.log('❌ [IAP] Finish transaction error:', error);
    }
  },

  validateReceipt: async receipt => {
    try {
      const body = {
        'receipt-data': receipt,
        password: APPLE_IAP_SHARED_SECRET,
      };

      console.log('🔍 [IAP] Validating receipt with production URL first...');

      // Step 1: Try production URL first (Apple's recommended approach)
      let response = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

      let json = await response.json();
      console.log('🔍 [IAP] Production validation response:', json.status);

      // Step 2: If status 21007 (sandbox receipt), retry with sandbox URL
      if (json.status === 21007) {
        console.log(
          'ℹ️ [IAP] Sandbox receipt detected, retrying with sandbox URL...'
        );

        response = await fetch(
          'https://sandbox.itunes.apple.com/verifyReceipt',
          {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
          }
        );

        json = await response.json();
        console.log('🔍 [IAP] Sandbox validation response:', json.status);
      }

      // Step 3: Check final result
      if (json.status === 0) {
        console.log('✅ [IAP] Receipt validation successful');
        return { success: true, data: json };
      } else {
        console.log(
          '❌ [IAP] Receipt validation failed with status:',
          json.status
        );
        return { success: false, status: json.status, data: json };
      }
    } catch (error) {
      console.log('❌ [IAP] Receipt validation error:', error);
      return { success: false, error: error.message };
    }
  },

  disconnect: async () => {
    try {
      await RNIap.endConnection();
      console.log('🔌 [IAP] Disconnected');
    } catch (error) {
      console.log('❌ [IAP] Disconnect error:', error);
    }
  },
};

export default IAP;
