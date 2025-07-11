import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  PurchaseError,
  requestSubscription,
  useIAP,
  withIAPContext,
  finishTransaction,
  getAvailablePurchases,
} from 'react-native-iap';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import useUserStore from '../store/useUserStore';

const isIos = Platform.OS === 'ios';
const subscriptionSkus = Platform.select({
  ios: ['habittracker.premium.monthly.v2', 'habittracker.premium.yearly'],
});

const VALIDATION_URL = 'https://iap-receipt-server.onrender.com/verify-receipt';
const isExpoGo = Constants.appOwnership === 'expo';

const Subscriptions = ({ onSuccess, onClose }) => {
  const router = useRouter();
  const { from } = useLocalSearchParams();

  const setPremium = useUserStore(state => state.setPremium);

  const {
    connected,
    subscriptions,
    getSubscriptions,
    currentPurchase,
    availablePurchases,
  } = useIAP();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [processingPurchase, setProcessingPurchase] = useState(null);

  // Handle Expo Go scenario
  if (isExpoGo && Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>In-App Purchases Not Available</Text>
          <Text style={styles.subText}>
            IAP only works in TestFlight or a production build.
          </Text>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => {
              onSuccess?.();
              router.back();
            }}
          >
            <Text style={styles.buttonText}>Continue Without Premium</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Load subscriptions and purchase history
  useEffect(() => {
    const load = async () => {
      try {
        await getSubscriptions({ skus: subscriptionSkus });
        await getAvailablePurchases();
      } catch (e) {
        console.error('[IAP] Load error:', e);
        Alert.alert('Error', 'Failed to load subscriptions.');
      } finally {
        setInitialLoading(false);
      }
    };
    if (connected) load();
  }, [connected]);

  // Validate purchase when currentPurchase updates
  useEffect(() => {
    const validatePurchase = async () => {
      if (
        !currentPurchase?.transactionReceipt ||
        processingPurchase === currentPurchase.transactionId
      )
        return;
      setProcessingPurchase(currentPurchase.transactionId);
      setLoading(true);

      try {
        const response = await fetch(VALIDATION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiptData: currentPurchase.transactionReceipt,
            productId: currentPurchase.productId,
            environment: __DEV__ ? 'sandbox' : 'production',
          }),
        });

        const result = await response.json();
        console.log('[IAP] Server response:', result);

        if (result.status === 0 || result.valid === true) {
          setPremium(true);
          Alert.alert('Purchase Success', 'You now have premium access.', [
            {
              text: 'OK',
              onPress: () => {
                onSuccess?.();
                if (from === 'settings') router.replace('/settings');
                else router.replace('/');
              },
            },
          ]);
        } else {
          Alert.alert('Validation Failed', 'Unable to verify your purchase.');
        }
      } catch (err) {
        console.error('[IAP] Validation error:', err);
        Alert.alert('Error', 'Failed to validate purchase.');
      } finally {
        try {
          await finishTransaction(currentPurchase);
        } catch (finishErr) {
          console.error('[IAP] Finish transaction error:', finishErr);
        }
        setProcessingPurchase(null);
        setLoading(false);
      }
    };

    if (currentPurchase) validatePurchase();
  }, [currentPurchase]);

  // Update premium status based on available purchases
  useEffect(() => {
    const validateActiveSubscriptions = async () => {
      const active = availablePurchases.find(p =>
        subscriptionSkus.includes(p.productId)
      );
      if (active && active.transactionReceipt) {
        try {
          const response = await fetch(VALIDATION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              receiptData: active.transactionReceipt,
              productId: active.productId,
              environment: __DEV__ ? 'sandbox' : 'production',
            }),
          });
          const result = await response.json();
          setPremium(result.status === 0 || result.valid === true);
        } catch (err) {
          console.error('[IAP] Active subscription validation error:', err);
          setPremium(false);
        }
      } else {
        setPremium(false);
      }
    };
    validateActiveSubscriptions();
  }, [availablePurchases]);

  const handleBuy = async productId => {
    if (loading || processingPurchase) return;
    try {
      setLoading(true);
      await requestSubscription({ sku: productId });
    } catch (err) {
      if (err instanceof PurchaseError && err.code === 'E_USER_CANCELLED')
        return;
      console.error('[IAP] Purchase error:', err);
      Alert.alert('Error', err.message || 'Could not complete purchase.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (loading || processingPurchase) return;
    setLoading(true);
    try {
      const purchases = await getAvailablePurchases();
      const active = purchases.find(p =>
        subscriptionSkus.includes(p.productId)
      );
      if (active && active.transactionReceipt) {
        const response = await fetch(VALIDATION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiptData: active.transactionReceipt,
            productId: active.productId,
            environment: __DEV__ ? 'sandbox' : 'production',
          }),
        });
        const result = await response.json();
        if (result.status === 0 || result.valid === true) {
          setPremium(true);
          Alert.alert('Restored', 'Subscription restored.');
          onSuccess?.();
          router.back();
        } else {
          Alert.alert('Validation Failed', 'Restored subscription is invalid.');
        }
      } else {
        Alert.alert(
          'No Active Subscriptions',
          'No active subscriptions found.'
        );
      }
    } catch (error) {
      console.error('[IAP] Restore error:', error);
      Alert.alert('Restore Failed', 'Could not restore purchases.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose?.();
    router.back();
  };

  if (!connected || initialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeSubscription = availablePurchases.find(p =>
    subscriptionSkus.includes(p.productId)
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.wrapper}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>Unlock premium features</Text>

        {subscriptions.map((s, i) => {
          const isCurrentPlan =
            activeSubscription && activeSubscription.productId === s.productId;
          const buttonText = isCurrentPlan
            ? 'Current Plan'
            : activeSubscription
              ? `Switch to ${s.title.split(' ')[0]}`
              : 'Upgrade to Premium';
          const isDisabled = loading || processingPurchase || isCurrentPlan;

          return (
            <View key={i} style={styles.subscriptionBox}>
              <View style={styles.subscriptionHeader}>
                <Text style={styles.subscriptionTitle}>{s.title}</Text>
                <Text style={styles.subscriptionPrice}>{s.localizedPrice}</Text>
              </View>
              <Text style={styles.subscriptionDescription}>
                {s.description}
              </Text>
              <TouchableOpacity
                style={[
                  styles.button,
                  isCurrentPlan ? styles.continueButton : null,
                  isDisabled && styles.disabledButton,
                ]}
                onPress={() => handleBuy(s.productId)}
                disabled={isDisabled}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Processing...' : buttonText}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#FFA500', marginTop: 10 }]}
          onPress={handleRestore}
          disabled={loading || processingPurchase}
        >
          <Text style={styles.buttonText}>Restore Purchases</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#ccc', marginTop: 10 }]}
          onPress={handleCancel}
        >
          <Text style={[styles.buttonText, { color: '#333' }]}>
            Cancel / Go Back
          </Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Subscriptions auto-renew. Cancel anytime in Settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default withIAPContext(Subscriptions);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  wrapper: { padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
  errorText: {
    fontSize: 18,
    color: '#f44336',
    textAlign: 'center',
    fontWeight: '600',
  },
  subText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  subscriptionBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subscriptionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subscriptionPrice: { fontSize: 18, color: '#4CAF50', fontWeight: '600' },
  subscriptionDescription: { fontSize: 14, color: '#555', lineHeight: 20 },
  button: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  continueButton: { backgroundColor: '#2196F3' },
  disabledButton: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 30,
    lineHeight: 18,
  },
});
