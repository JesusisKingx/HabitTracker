import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';

import {
  finishTransaction,
  PurchaseError,
  requestSubscription,
  useIAP,
  withIAPContext,
} from 'react-native-iap';

import { ITUNES_SHARED_SECRET } from '@env';

const isIos = Platform.OS === 'ios';

const subscriptionSkus = Platform.select({
  ios: ['habittracker.premium.monthly.v2', 'habittracker.premium.yearly'],
});

const validateReceiptDirectly = async (receipt, isRetry = false) => {
  const endpoint = isRetry
    ? 'https://sandbox.itunes.apple.com/verifyReceipt'
    : 'https://buy.itunes.apple.com/verifyReceipt';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receipt.trim(),
        password: ITUNES_SHARED_SECRET.trim(),
        'exclude-old-transactions': true,
      }),
    });

    const result = await response.json();
    console.log(
      `Validation result from ${isRetry ? 'sandbox' : 'production'}:`,
      result.status
    );

    if (result.status === 21007 && !isRetry) {
      return validateReceiptDirectly(receipt, true);
    }

    return result;
  } catch (error) {
    console.error('Direct validation error:', error);
    throw error;
  }
};

const Subscriptions = ({
  onSuccess,
  visible,
  onClose,
  restorePurchases,
  theme,
}) => {
  const {
    connected,
    subscriptions,
    getSubscriptions,
    currentPurchase,
    getPurchaseHistory,
    purchaseHistory,
  } = useIAP();

  const [loading, setLoading] = useState(false);

  // Handle restore purchases functionality
  const handleRestorePurchases = async () => {
    if (!restorePurchases) {
      try {
        setLoading(true);
        await getPurchaseHistory();

        // Check if user has any valid purchases
        const hasValidSubscription = purchaseHistory.some(p =>
          subscriptionSkus.includes(p.productId)
        );

        if (hasValidSubscription) {
          onSuccess?.();
          Alert.alert('Success', 'Your subscription has been restored!');
        } else {
          Alert.alert(
            'No Purchases Found',
            'No previous purchases were found.'
          );
        }
      } catch (error) {
        Alert.alert('Error', 'Could not restore purchases. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      // Use the passed restore function if available
      restorePurchases();
    }
  };

  useEffect(() => {
    if (connected) {
      getPurchaseHistory();
      getSubscriptions({ skus: subscriptionSkus });
    }
  }, [connected]);

  useEffect(() => {
    if (purchaseHistory.some(p => subscriptionSkus.includes(p.productId))) {
      onSuccess?.();
    }
  }, [purchaseHistory]);

  const handleBuySubscription = async productId => {
    try {
      setLoading(true);
      await requestSubscription({
        sku: productId,
        andDangerouslyFinishTransactionAutomaticallyIOS: true,
      });
    } catch (error) {
      setLoading(false);
      const message =
        error instanceof PurchaseError
          ? error.message
          : 'Could not complete purchase';
      Alert.alert('Purchase Error', message);
    }
  };

  useEffect(() => {
    const checkCurrentPurchase = async purchase => {
      if (!purchase) return;

      try {
        const receipt = purchase.transactionReceipt;
        if (!receipt) return;

        if (!ITUNES_SHARED_SECRET) {
          Alert.alert('Configuration Error', 'Missing shared secret');
          return;
        }

        const result = await validateReceiptDirectly(receipt);
        if (result.status === 0) {
          const latestReceipt = result.latest_receipt_info?.[0];
          if (latestReceipt) {
            console.log(
              'Subscription expires:',
              new Date(parseInt(latestReceipt.expires_date_ms))
            );
          }

          await finishTransaction({ purchase, isConsumable: false });
          onSuccess?.();
          Alert.alert('Success', 'Premium activated!');
        } else {
          Alert.alert('Receipt Error', `Validation failed: ${result.status}`);
        }
      } catch (err) {
        console.error('Purchase handling error:', err);
        Alert.alert('Error', 'Failed to process your subscription.');
      } finally {
        setLoading(false);
      }
    };

    checkCurrentPurchase(currentPurchase);
  }, [currentPurchase]);

  if (!connected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Connecting to App Store...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={{ padding: 20 }}>
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.subtitle}>
            Track unlimited habits and unlock all features
          </Text>

          {/* Free Trial Banner - Only show if monthly plan exists and user hasn't purchased it */}
          {subscriptions.some(
            sub =>
              sub.productId === 'habittracker.premium.monthly.v2' &&
              !purchaseHistory.find(
                p => p.productId === 'habittracker.premium.monthly.v2'
              )
          ) && (
            <View style={styles.freeTrialBanner}>
              <Text style={styles.freeTrialText}>
                🎁 3-Day Free Trial Available!
              </Text>
              <Text style={styles.freeTrialSubtext}>
                Try premium features risk-free
              </Text>
            </View>
          )}

          {subscriptions.map((subscription, index) => {
            const owned = purchaseHistory.find(
              p => p.productId === subscription.productId
            );
            const isYearly = subscription.productId.includes('yearly');

            return (
              <View
                style={[
                  styles.subscriptionBox,
                  isYearly && styles.recommendedBox,
                ]}
                key={index}
              >
                {isYearly && (
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedText}>BEST VALUE</Text>
                  </View>
                )}

                <View style={styles.subscriptionHeader}>
                  <Text style={styles.subscriptionTitle}>
                    {subscription.title}
                  </Text>
                  <Text style={styles.subscriptionPrice}>
                    {subscription.localizedPrice}
                  </Text>
                </View>

                <Text style={styles.subscriptionDescription}>
                  {subscription.description}
                </Text>

                {owned ? (
                  <Text style={styles.ownedText}>✓ Currently Subscribed</Text>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.button,
                      isYearly && styles.recommendedButton,
                    ]}
                    onPress={() =>
                      handleBuySubscription(subscription.productId)
                    }
                  >
                    <Text style={styles.buttonText}>
                      {isYearly ? 'Get Best Value' : 'Subscribe Monthly'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#ccc', marginTop: 30 }]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: '#333' }]}>
              Cancel / Go Back
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              marginTop: 10,
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: '#4CAF50',
              borderRadius: 8,
            }}
            onPress={handleRestorePurchases}
            disabled={loading}
          >
            <Text
              style={{ color: '#FFF', fontWeight: '600', textAlign: 'center' }}
            >
              {loading ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// Add device detection if not already imported from parent
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const DeviceInfo = {
  isTablet: () => {
    const aspectRatio = screenHeight / screenWidth;
    return screenWidth >= 768 || (aspectRatio < 1.6 && screenWidth >= 468);
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  freeTrialBanner: {
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    padding: DeviceInfo.isTablet() ? 20 : 16,
    marginHorizontal: DeviceInfo.isTablet() ? 20 : 10,
    marginVertical: DeviceInfo.isTablet() ? 15 : 10,
    borderWidth: 1,
    borderColor: '#4CAF50',
    alignItems: 'center',
  },
  freeTrialText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  freeTrialSubtext: {
    fontSize: 14,
    color: '#388E3C',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  title: {
    fontSize: 32,
    textAlign: 'center',
    paddingBottom: 8,
    color: '#333',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
  },
  subscriptionBox: {
    margin: 10,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  recommendedBox: { borderWidth: 2, borderColor: '#4CAF50' },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recommendedText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subscriptionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subscriptionPrice: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50' },
  subscriptionDescription: { fontSize: 14, color: '#666', marginBottom: 10 },
  ownedText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
  },
  recommendedButton: { backgroundColor: '#2E7D32' },
  buttonText: { fontSize: 16, fontWeight: 'bold', color: 'white' },
});

export default withIAPContext(Subscriptions);
