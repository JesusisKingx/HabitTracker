import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import {
  finishTransaction,
  getAvailablePurchases,
  PurchaseError,
  requestSubscription,
  useIAP,
  withIAPContext,
} from 'react-native-iap';
import useUserStore from '../store/useUserStore';

const isIos = Platform.OS === 'ios';
const subscriptionSkus = Platform.select({
  ios: ['habittracker.premium.monthly.v2', 'habittracker.premium.yearly'],
});

const VALIDATION_URL = 'https://iap-receipt-server.onrender.com/verify-receipt';
const isExpoGo = Constants.appOwnership === 'expo';

console.log('🚀 [IAP] Subscriptions component loaded');
console.log('🚀 [IAP] Platform:', Platform.OS);
console.log('🚀 [IAP] Is Expo Go:', isExpoGo);
console.log('🚀 [IAP] Subscription SKUs:', subscriptionSkus);

const errorLog = ({ message, error }) => {
  console.error('❌ [IAP ERROR]', message, error);
};

const Subscriptions = ({ onSuccess, onClose }) => {
  const router = useRouter();
  const { from } = useLocalSearchParams();
  const loadingRef = useRef(false);
  const retryTimeoutRef = useRef(null);

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
  const [loadError, setLoadError] = useState(null);

  console.log('🔍 [IAP STATE] Component render - Connected:', connected);
  console.log(
    '🔍 [IAP STATE] Subscriptions count:',
    subscriptions?.length || 0
  );
  console.log(
    '🔍 [IAP STATE] Available purchases:',
    availablePurchases?.length || 0
  );
  console.log(
    '🔍 [IAP STATE] Current purchase:',
    currentPurchase ? 'In Progress' : 'None'
  );
  console.log('🔍 [IAP STATE] Loading states:', {
    loading,
    initialLoading,
    processingPurchase,
  });

  // Handle Expo Go scenario
  if (isExpoGo && Platform.OS !== 'web') {
    console.log('⚠️ [IAP] Running in Expo Go - IAP not available');
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
              console.log('📱 [IAP] User continuing without premium');
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

  // Load subscriptions with proper error handling and debouncing
  const loadSubscriptions = async () => {
    if (loadingRef.current) {
      console.log('⏳ [IAP] Load already in progress, skipping...');
      return;
    }

    loadingRef.current = true;
    setLoadError(null);

    try {
      console.log(
        '📦 [IAP] Loading subscriptions with SKUs:',
        subscriptionSkus
      );

      // Add small delay to prevent rapid requests
      await new Promise(resolve => setTimeout(resolve, 500));

      await getSubscriptions({ skus: subscriptionSkus });
      console.log('✅ [IAP] Subscriptions loaded successfully');

      console.log('📋 [IAP] Getting available purchases...');
      await getAvailablePurchases();
      console.log('✅ [IAP] Available purchases loaded');

      setLoadError(null);
    } catch (e) {
      console.error('❌ [IAP] Load error:', e);
      console.error('❌ [IAP] Load error message:', e.message);

      setLoadError(e.message);

      // Don't show alert for cancelled requests - just retry
      if (!e.message.includes('cancelled')) {
        Alert.alert('Error', 'Failed to load subscriptions.');
      } else {
        console.log('🔄 [IAP] Request cancelled, will retry...');
        // Retry after delay
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        retryTimeoutRef.current = setTimeout(() => {
          if (connected && loadingRef.current) {
            loadingRef.current = false;
            loadSubscriptions();
          }
        }, 2000);
      }
    } finally {
      loadingRef.current = false;
      setInitialLoading(false);
      console.log('🏁 [IAP] Initial loading complete');
    }
  };

  // Load subscriptions when IAP connects
  useEffect(() => {
    console.log('🔄 [IAP] Connection effect triggered, connected:', connected);

    if (connected && !loadingRef.current) {
      console.log('🚀 [IAP] IAP connected, starting load process');
      loadSubscriptions();
    } else if (!connected) {
      console.log('⏳ [IAP] Waiting for IAP connection...');
    }

    // Cleanup timeout on unmount
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [connected]);

  // Log subscription products when they change
  useEffect(() => {
    if (subscriptions && subscriptions.length > 0) {
      console.log('🎯 [IAP] Products loaded:', subscriptions.length);
      console.log(
        '🎯 [IAP] Product details:',
        subscriptions.map(s => ({
          productId: s.productId,
          price: s.price,
          localizedPrice: s.localizedPrice,
          title: s.title,
          description: s.description,
        }))
      );
    } else {
      console.log('📭 [IAP] No products available yet');
    }
  }, [subscriptions]);

  // Log available purchases when they change
  useEffect(() => {
    if (availablePurchases && availablePurchases.length > 0) {
      console.log('💰 [IAP] Available purchases:', availablePurchases.length);
      console.log(
        '💰 [IAP] Purchase details:',
        availablePurchases.map(p => ({
          productId: p.productId,
          transactionId: p.transactionId,
          transactionDate: p.transactionDate,
        }))
      );
    } else {
      console.log('💸 [IAP] No available purchases');
    }
  }, [availablePurchases]);

  // Handle current purchase processing
  useEffect(() => {
    const validatePurchase = async () => {
      if (!currentPurchase) return;

      console.log('🛒 [IAP] Processing current purchase:', {
        productId: currentPurchase.productId,
        transactionId: currentPurchase.transactionId,
        transactionDate: currentPurchase.transactionDate,
      });

      setProcessingPurchase(currentPurchase.productId);
      setLoading(true);

      try {
        const receipt = currentPurchase.transactionReceipt;
        console.log('📄 [IAP] Receipt length:', receipt?.length || 0);
        console.log(
          '📄 [IAP] Receipt preview:',
          receipt?.substring(0, 100) + '...'
        );

        console.log('🌐 [IAP] Validating receipt with server:', VALIDATION_URL);
        const response = await fetch(VALIDATION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiptData: receipt,
            productId: currentPurchase.productId,
            environment: __DEV__ ? 'sandbox' : 'production',
          }),
        });

        const result = await response.json();
        console.log('✅ [IAP] Validation response:', {
          status: result.status,
          valid: result.valid,
          environment: result.environment,
        });

        if (result.status === 0 || result.valid === true) {
          console.log('🎉 [IAP] Purchase validation successful!');
          setPremium(true);
          onSuccess?.();

          Alert.alert('Purchase Successful', 'Welcome to Premium! 🎉', [
            {
              text: 'OK',
              onPress: () => {
                console.log(
                  '📱 [IAP] User acknowledged success, navigating back'
                );
                if (from === 'settings') router.replace('/settings');
                else router.replace('/');
              },
            },
          ]);
        } else {
          console.log('❌ [IAP] Purchase validation failed:', result);
          Alert.alert('Validation Failed', 'Unable to verify your purchase.');
        }
      } catch (err) {
        console.error('❌ [IAP] Validation error:', err);
        console.error('❌ [IAP] Validation error message:', err.message);
        Alert.alert('Error', 'Failed to validate purchase.');
      } finally {
        try {
          console.log('🔚 [IAP] Finishing transaction...');
          await finishTransaction(currentPurchase);
          console.log('✅ [IAP] Transaction finished successfully');
        } catch (finishErr) {
          console.error('❌ [IAP] Finish transaction error:', finishErr);
        }
        setProcessingPurchase(null);
        setLoading(false);
        console.log('🏁 [IAP] Purchase processing complete');
      }
    };

    if (currentPurchase) {
      console.log('🚀 [IAP] New purchase detected, starting validation');
      validatePurchase();
    }
  }, [currentPurchase]);

  // Update premium status based on available purchases
  useEffect(() => {
    const validateActiveSubscriptions = async () => {
      console.log('🔍 [IAP] Checking for active subscriptions...');
      const active = availablePurchases.find(p =>
        subscriptionSkus.includes(p.productId)
      );

      if (active && active.transactionReceipt) {
        console.log('💎 [IAP] Found active subscription:', {
          productId: active.productId,
          transactionId: active.transactionId,
        });

        try {
          console.log('🌐 [IAP] Validating active subscription...');
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

          const isValid = result.status === 0 || result.valid === true;
          console.log('✅ [IAP] Active subscription validation:', {
            valid: isValid,
            status: result.status,
          });

          setPremium(isValid);
        } catch (err) {
          console.error('❌ [IAP] Active subscription validation error:', err);
          setPremium(false);
        }
      } else {
        console.log('💸 [IAP] No active subscriptions found');
        setPremium(false);
      }
    };

    if (availablePurchases && availablePurchases.length > 0) {
      validateActiveSubscriptions();
    }
  }, [availablePurchases]);

  const handleBuy = async productId => {
    if (loading || processingPurchase) {
      console.log('⏳ [IAP] Purchase blocked - already processing');
      return;
    }

    console.log('🛒 [IAP] Starting purchase for product:', productId);
    console.log(
      '🛒 [IAP] Product details:',
      subscriptions.find(s => s.productId === productId)
    );

    try {
      setLoading(true);
      console.log('📱 [IAP] Requesting subscription...');
      await requestSubscription({ sku: productId });
      console.log('✅ [IAP] Subscription request sent successfully');
    } catch (err) {
      if (err instanceof PurchaseError && err.code === 'E_USER_CANCELLED') {
        console.log('🚫 [IAP] User cancelled purchase');
        return;
      }
      console.error('❌ [IAP] Purchase error:', err);
      console.error('❌ [IAP] Purchase error code:', err.code);
      console.error('❌ [IAP] Purchase error message:', err.message);
      Alert.alert('Error', err.message || 'Could not complete purchase.');
    } finally {
      setLoading(false);
      console.log('🏁 [IAP] Purchase attempt complete');
    }
  };

  const handleRestore = async () => {
    if (loading || processingPurchase) {
      console.log('⏳ [IAP] Restore blocked - already processing');
      return;
    }

    console.log('🔄 [IAP] Starting restore purchases...');
    setLoading(true);

    try {
      console.log('📋 [IAP] Getting available purchases for restore...');
      const purchases = await getAvailablePurchases();
      console.log(
        '📋 [IAP] Found purchases for restore:',
        purchases?.length || 0
      );

      const active = purchases.find(p =>
        subscriptionSkus.includes(p.productId)
      );

      if (active && active.transactionReceipt) {
        console.log(
          '💎 [IAP] Found subscription to restore:',
          active.productId
        );

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

        console.log('✅ [IAP] Restore validation result:', {
          status: result.status,
          valid: result.valid,
        });

        if (result.status === 0 || result.valid === true) {
          console.log('🎉 [IAP] Restore successful!');
          setPremium(true);
          Alert.alert('Restored', 'Subscription restored.');
          onSuccess?.();
          router.back();
        } else {
          console.log('❌ [IAP] Restore validation failed');
          Alert.alert('Validation Failed', 'Restored subscription is invalid.');
        }
      } else {
        console.log('💸 [IAP] No subscriptions found to restore');
        Alert.alert(
          'No Active Subscriptions',
          'No active subscriptions found.'
        );
      }
    } catch (error) {
      console.error('❌ [IAP] Restore error:', error);
      Alert.alert('Restore Failed', 'Could not restore purchases.');
    } finally {
      setLoading(false);
      console.log('🏁 [IAP] Restore process complete');
    }
  };

  const handleCancel = () => {
    console.log('🚫 [IAP] User cancelled subscription flow');
    onClose?.();
    router.back();
  };

  const handleRetry = () => {
    console.log('🔄 [IAP] User requested retry');
    setLoadError(null);
    setInitialLoading(true);
    loadingRef.current = false;
    if (connected) {
      loadSubscriptions();
    }
  };

  // Show loading screen
  if (!connected || initialLoading) {
    console.log(
      '⏳ [IAP] Showing loading screen - Connected:',
      connected,
      'Initial loading:',
      initialLoading
    );
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading subscriptions...</Text>
          {loadError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleRetry}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Show error if no products loaded
  if (!subscriptions || subscriptions.length === 0) {
    console.log('❌ [IAP] No products loaded, showing error');
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>No Subscriptions Available</Text>
          <Text style={styles.subText}>
            Unable to load subscription products. Please try again.
          </Text>
          <TouchableOpacity style={styles.continueButton} onPress={handleRetry}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCancel}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const activeSubscription = availablePurchases.find(p =>
    subscriptionSkus.includes(p.productId)
  );

  console.log('🎨 [IAP] Rendering subscription UI');
  console.log(
    '🎨 [IAP] Active subscription:',
    activeSubscription?.productId || 'None'
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
              ? 'Switch Plan'
              : 'Subscribe';

          console.log('🎨 [IAP] Rendering product:', {
            productId: s.productId,
            price: s.localizedPrice,
            isCurrentPlan,
            buttonText,
          });

          return (
            <View key={s.productId} style={styles.productContainer}>
              <View style={styles.productInfo}>
                <Text style={styles.productTitle}>{s.title}</Text>
                <Text style={styles.productPrice}>{s.localizedPrice}</Text>
                <Text style={styles.productDescription}>{s.description}</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.buyButton,
                  isCurrentPlan && styles.currentPlanButton,
                  (loading || processingPurchase === s.productId) &&
                    styles.disabledButton,
                ]}
                onPress={() => {
                  console.log('👆 [IAP] User tapped product:', s.productId);
                  if (!isCurrentPlan) handleBuy(s.productId);
                }}
                disabled={loading || processingPurchase === s.productId}
              >
                {processingPurchase === s.productId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buyButtonText}>{buttonText}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.secondaryButton, loading && styles.disabledButton]}
            onPress={() => {
              console.log('👆 [IAP] User tapped restore');
              handleRestore();
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, loading && styles.disabledButton]}
            onPress={() => {
              console.log('👆 [IAP] User tapped cancel');
              handleCancel();
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  wrapper: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  productContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  productInfo: {
    marginBottom: 15,
  },
  productTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  productPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  productDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  buyButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  currentPlanButton: {
    backgroundColor: '#9E9E9E',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  secondaryButton: {
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    minWidth: 120,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 10,
  },
  subText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  continueButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 15,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default withIAPContext(Subscriptions);
