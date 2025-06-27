// MY Habit tracker IOS App with real IAP
import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { APPLE_IAP_SHARED_SECRET } from '@env';

console.log(
  '🔐 IAP Shared Secret:',
  APPLE_IAP_SHARED_SECRET ? 'Found' : 'Missing'
);

import {
  StyleSheet,
  View,
  ScrollView,
  SafeAreaView,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Platform,
  Linking,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import IAP from '../../utils/iapHelper';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Request notification permissions
const requestNotificationPermissions = async () => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  return true;
};

// Schedule daily reminder
const scheduleDailyReminder = async (hour = 20, minute = 0) => {
  try {
    // Cancel any existing notifications
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Schedule daily notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Keep your streak alive! 🔥',
        body: 'Your habits are waiting. Make today count!',
        sound: true,
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });

    // Return success
    return { success: true, notificationId };
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return { success: false, error };
  }
};

const HABIT_DATA_KEY = '@HabitTracker:habitData';
const HABITS_LIST_KEY = '@HabitTracker:habitsList';
const SELECTED_HABIT_KEY = '@HabitTracker:selectedHabit';
const PREMIUM_STATUS_KEY = '@HabitTracker:isPremium';

// In-App Purchase Product IDs
const PRODUCT_IDS = {
  MONTHLY: 'habittracker.premium.monthly.v2',
  YEARLY: 'habittracker.premium.yearly',
};

// 🛠️ This is now handled in iapHelper.js validateReceipt method
// Removed global fetch override as it's not needed

// Available colors for habits
const HABIT_COLORS = [
  { name: 'Green', value: '#4CAF50' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Purple', value: '#9C27B0' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Red', value: '#F44336' },
  { name: 'Teal', value: '#009688' },
  { name: 'Pink', value: '#E91E63' },
  { name: 'Indigo', value: '#3F51B5' },
];

// Helper function to get local date string
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Motivational quotes for different streak milestones
const STREAK_QUOTES = {
  1: [
    '🌱 Great start! Every journey begins with a single session.',
    "✨ First check complete! You're building something amazing.",
    '🎯 One down! The habit journey begins now.',
  ],
  3: [
    "🔥 3 sessions strong! You're on fire!",
    "💪 Three times! You're building momentum.",
    '⚡ 3 in a row! The habit is starting to stick!',
  ],
  7: [
    "🚀 Seven sessions complete! You're unstoppable!",
    '🏆 7 times strong! This is how champions are made.',
    "💫 Seven victories! You're proving your commitment.",
  ],
  14: [
    "🌟 14 sessions! You're officially building a real habit!",
    '🔥 Two weeks of dedication! Your willpower is incredible.',
    "💎 14-session streak! You're becoming unstoppable.",
  ],
  21: [
    "🎉 21 times! Scientists say you're forming a real habit!",
    "👑 21 sessions! You're a habit-building champion!",
    "🌈 21-session milestone! You've proven you can do anything!",
  ],
  30: [
    "🏅 30 sessions complete! You're officially a habit master!",
    "🚀 30 times! You're inspiring!",
    '💪 30 victories! Nothing can stop you now!',
  ],
  50: [
    "🌟 50 sessions! You're in the top 1% of habit builders!",
    "🔥 Fifty times! You're absolutely incredible!",
    "💎 50-session streak! You're proving that persistence pays off!",
  ],
  100: [
    "🏆 100 SESSIONS! You're officially a habit legend!",
    "👑 Triple digits! You've achieved what most people dream of!",
    "🌟 100 times! You're absolutely unstoppable!",
  ],
  365: [
    "🎊 365 SESSIONS! You're a habit master of the universe!",
    "👑 A full year's worth! You've achieved the ultimate milestone!",
    "🌟 365 victories! You're living proof that dreams come true!",
  ],
};

// Get motivational quote for current streak
const getStreakQuote = (streak, trackingDays) => {
  const isDaily = trackingDays && trackingDays.length === 7;

  // Check for exact milestone matches first
  if (STREAK_QUOTES[streak]) {
    const quotes = STREAK_QUOTES[streak];
    let quote = quotes[Math.floor(Math.random() * quotes.length)];

    // For daily habits, replace "sessions" with "days"
    if (isDaily) {
      quote = quote.replace(/sessions?/gi, 'days').replace(/times/gi, 'days');
    }

    return quote;
  }

  // Special case for zero
  if (streak === 0) {
    return isDaily
      ? '💪 Ready to start your streak? Today is the perfect day!'
      : '💪 Ready to start your streak? Your next scheduled session awaits!';
  }

  // For non-milestone days, show encouraging message with actual count
  return isDaily
    ? `🔥 ${streak} days strong! Keep the momentum going!`
    : `🔥 ${streak} sessions strong! Keep the momentum going!`;
};

// Edit Habit Modal Component
const EditHabitModal = ({ visible, onClose, habit, onUpdateHabit }) => {
  const [habitName, setHabitName] = useState('');
  const [selectedColor, setSelectedColor] = useState(HABIT_COLORS[0].value);
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]);

  // Initialize form with current habit data
  useEffect(() => {
    if (habit) {
      setHabitName(habit.name);
      setSelectedColor(habit.color);
      setSelectedDays(habit.trackingDays || [0, 1, 2, 3, 4, 5, 6]);
    }
  }, [habit]);

  const handleUpdateHabit = () => {
    const trimmedName = habitName.trim();
    if (trimmedName.length === 0) {
      Alert.alert('Invalid Name', 'Habit name cannot be empty');
      return;
    }

    if (trimmedName.length > 30) {
      Alert.alert('Name Too Long', 'Habit name must be 30 characters or less');
      return;
    }

    if (selectedDays.length === 0) {
      Alert.alert(
        'Select Days',
        'Please select at least one day to track this habit.'
      );
      return;
    }

    onUpdateHabit({
      ...habit,
      name: trimmedName,
      color: selectedColor,
      trackingDays: selectedDays,
    });

    onClose();
  };

  if (!habit) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={addHabitStyles.modalOverlay}>
        <View style={addHabitStyles.modalContent}>
          <View style={addHabitStyles.modalHeader}>
            <Text style={addHabitStyles.modalTitle}>Edit Habit</Text>
            <TouchableOpacity
              style={addHabitStyles.closeButton}
              onPress={onClose}
            >
              <Text style={addHabitStyles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            <View style={addHabitStyles.inputSection}>
              <Text style={addHabitStyles.label}>Habit Name</Text>
              <TextInput
                style={addHabitStyles.input}
                value={habitName}
                onChangeText={setHabitName}
                placeholder="e.g., Exercise Daily, Read 20 Minutes"
                maxLength={30}
              />
              <Text style={addHabitStyles.charCount}>
                {habitName.length}/30 characters
              </Text>
            </View>

            <View style={addHabitStyles.colorSection}>
              <Text style={addHabitStyles.label}>Choose Color</Text>
              <View style={addHabitStyles.colorGrid}>
                {HABIT_COLORS.map(color => (
                  <TouchableOpacity
                    key={color.value}
                    style={[
                      addHabitStyles.colorOption,
                      { backgroundColor: color.value },
                      selectedColor === color.value &&
                        addHabitStyles.selectedColor,
                    ]}
                    onPress={() => setSelectedColor(color.value)}
                  >
                    {selectedColor === color.value && (
                      <Text style={addHabitStyles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={addHabitStyles.label}>Track on these days:</Text>
              <View style={addHabitStyles.daySelector}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                  (day, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        addHabitStyles.dayButton,
                        selectedDays.includes(index) &&
                          addHabitStyles.selectedDay,
                      ]}
                      onPress={() => {
                        if (selectedDays.includes(index)) {
                          setSelectedDays(
                            selectedDays.filter(d => d !== index)
                          );
                        } else {
                          setSelectedDays([...selectedDays, index].sort());
                        }
                      }}
                    >
                      <Text
                        style={[
                          addHabitStyles.dayButtonText,
                          selectedDays.includes(index) &&
                            addHabitStyles.selectedDayText,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>

            <TouchableOpacity
              style={addHabitStyles.addButton}
              onPress={handleUpdateHabit}
            >
              <Text style={addHabitStyles.addButtonText}>Update Habit</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Add Habit Modal Component
const AddHabitModal = ({
  visible,
  onClose,
  onAddHabit,
  habitCount,
  isPremium,
  onUpgradePremium,
}) => {
  const [habitName, setHabitName] = useState('');
  const [selectedColor, setSelectedColor] = useState(HABIT_COLORS[0].value);
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]);

  const canAddHabit = isPremium || habitCount < 1;

  const handleAddHabit = () => {
    const trimmedName = habitName.trim();
    if (trimmedName.length === 0) {
      Alert.alert('Invalid Name', 'Please enter a habit name');
      return;
    }

    if (trimmedName.length > 30) {
      Alert.alert('Name Too Long', 'Habit name must be 30 characters or less');
      return;
    }

    if (selectedDays.length === 0) {
      Alert.alert(
        'Select Days',
        'Please select at least one day to track this habit.'
      );
      return;
    }

    if (!canAddHabit) {
      Alert.alert(
        'Premium Feature',
        'You can track 1 habit for free. Upgrade to Premium to track unlimited habits!',
        [
          { text: 'Maybe Later', style: 'cancel' },
          {
            text: 'Upgrade to Premium',
            onPress: () => {
              onClose(); // Close the add habit modal first
              onUpgradePremium();
            },
          },
        ]
      );
      return;
    }

    onAddHabit({
      id: Date.now().toString(),
      name: trimmedName,
      color: selectedColor,
      createdAt: new Date().toISOString(),
      trackingDays: selectedDays,
    });

    setHabitName('');
    setSelectedColor(HABIT_COLORS[0].value);
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={addHabitStyles.modalOverlay}>
        <View style={addHabitStyles.modalContent}>
          <View style={addHabitStyles.modalHeader}>
            <Text style={addHabitStyles.modalTitle}>Add New Habit</Text>
            <TouchableOpacity
              style={addHabitStyles.closeButton}
              onPress={onClose}
            >
              <Text style={addHabitStyles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {!canAddHabit && (
              <View style={addHabitStyles.premiumNotice}>
                <Text style={addHabitStyles.premiumText}>
                  🔒 You can track 1 habit for free. Upgrade to Premium for
                  unlimited habits!
                </Text>
              </View>
            )}

            <View style={addHabitStyles.inputSection}>
              <Text style={addHabitStyles.label}>Habit Name</Text>
              <TextInput
                style={addHabitStyles.input}
                value={habitName}
                onChangeText={setHabitName}
                placeholder="e.g., Exercise Daily, Read 20 Minutes"
                maxLength={30}
                editable={canAddHabit}
              />
              <Text style={addHabitStyles.charCount}>
                {habitName.length}/30 characters
              </Text>
            </View>

            <View style={addHabitStyles.colorSection}>
              <Text style={addHabitStyles.label}>Choose Color</Text>
              <View style={addHabitStyles.colorGrid}>
                {HABIT_COLORS.map(color => (
                  <TouchableOpacity
                    key={color.value}
                    style={[
                      addHabitStyles.colorOption,
                      { backgroundColor: color.value },
                      selectedColor === color.value &&
                        addHabitStyles.selectedColor,
                    ]}
                    onPress={() => setSelectedColor(color.value)}
                  >
                    {selectedColor === color.value && (
                      <Text style={addHabitStyles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={addHabitStyles.label}>Track on these days:</Text>
              <View style={addHabitStyles.daySelector}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                  (day, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        addHabitStyles.dayButton,
                        selectedDays.includes(index) &&
                          addHabitStyles.selectedDay,
                      ]}
                      onPress={() => {
                        if (selectedDays.includes(index)) {
                          // Remove day if already selected
                          setSelectedDays(
                            selectedDays.filter(d => d !== index)
                          );
                        } else {
                          // Add day if not selected
                          setSelectedDays([...selectedDays, index].sort());
                        }
                      }}
                    >
                      <Text
                        style={[
                          addHabitStyles.dayButtonText,
                          selectedDays.includes(index) &&
                            addHabitStyles.selectedDayText,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>

            <TouchableOpacity
              style={[
                addHabitStyles.addButton,
                !canAddHabit && addHabitStyles.disabledButton,
              ]}
              onPress={handleAddHabit}
              disabled={!canAddHabit}
            >
              <Text
                style={[
                  addHabitStyles.addButtonText,
                  !canAddHabit && addHabitStyles.disabledButtonText,
                ]}
              >
                {canAddHabit ? 'Add Habit' : 'Upgrade to Premium'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// Habit Selector Component
const HabitSelector = ({
  habits,
  selectedHabitId,
  onSelectHabit,
  onAddHabit,
  onDeleteHabit,
}) => {
  const [longPressedHabitId, setLongPressedHabitId] = useState(null);
  const selectedHabit = habits.find(h => h.id === selectedHabitId) || habits[0];

  if (habits.length === 0) {
    return (
      <View style={habitSelectorStyles.emptyContainer}>
        <TouchableOpacity
          style={habitSelectorStyles.addFirstHabit}
          onPress={onAddHabit}
        >
          <Text style={habitSelectorStyles.addFirstHabitText}>
            + Add Your First Habit
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (habits.length === 1) {
    return (
      <View style={habitSelectorStyles.singleHabitContainer}>
        <View style={habitSelectorStyles.habitNameContainer}>
          <View
            style={[
              habitSelectorStyles.colorDot,
              { backgroundColor: selectedHabit.color },
            ]}
          />
          <Text style={habitSelectorStyles.habitName}>
            {selectedHabit.name}
          </Text>
        </View>
        <TouchableOpacity
          style={habitSelectorStyles.addButton}
          onPress={onAddHabit}
        >
          <Text style={habitSelectorStyles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={habitSelectorStyles.scrollContainer}
      contentContainerStyle={habitSelectorStyles.scrollContent}
    >
      {habits.map(habit => (
        <View key={habit.id} style={habitSelectorStyles.habitTabContainer}>
          <TouchableOpacity
            style={[
              habitSelectorStyles.habitTab,
              selectedHabitId === habit.id && habitSelectorStyles.selectedTab,
              { borderBottomColor: habit.color },
            ]}
            onPress={() => {
              onSelectHabit(habit.id);
              setLongPressedHabitId(null); // Hide delete button when selecting
            }}
            onLongPress={() => setLongPressedHabitId(habit.id)}
            delayLongPress={500}
          >
            <View
              style={[
                habitSelectorStyles.colorDot,
                { backgroundColor: habit.color },
              ]}
            />
            <Text
              style={[
                habitSelectorStyles.tabText,
                selectedHabitId === habit.id &&
                  habitSelectorStyles.selectedTabText,
              ]}
            >
              {habit.name}
            </Text>
          </TouchableOpacity>
          {habits.length > 1 && longPressedHabitId === habit.id && (
            <TouchableOpacity
              style={habitSelectorStyles.deleteButton}
              onPress={() => {
                onDeleteHabit(habit.id);
                setLongPressedHabitId(null); // Hide after delete
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={habitSelectorStyles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity
        style={habitSelectorStyles.addTabButton}
        onPress={onAddHabit}
      >
        <Text style={habitSelectorStyles.addTabButtonText}>+</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// Settings Modal Component
const SettingsModal = ({
  visible,
  habitName,
  selectedHabit,
  onClose,
  onHabitNameChange,
  onResetData,
  onDeleteHabit,
  onUpgradePremium,
  onRestorePurchases,
  habitData,
  setHabitData,
  habitsList,
  exportUserData,
  testIAPConnection,
}) => {
  const [tempHabitName, setTempHabitName] = useState(habitName);
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setTempHabitName(habitName);
  }, [habitName]);

  const saveHabitName = () => {
    const trimmedName = tempHabitName.trim();
    if (trimmedName.length === 0) {
      Alert.alert('Invalid Name', 'Habit name cannot be empty');
      return;
    }
    if (trimmedName.length > 30) {
      Alert.alert('Name Too Long', 'Habit name must be 30 characters or less');
      return;
    }
    onHabitNameChange(trimmedName);
    setIsEditingName(false);
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'Are you sure you want to delete all your habit data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            onResetData();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={settingsStyles.modalOverlay}>
        <View style={settingsStyles.modalContent}>
          <View style={settingsStyles.modalHeader}>
            <Text style={settingsStyles.modalTitle}>Settings</Text>
            <TouchableOpacity
              style={settingsStyles.closeButton}
              onPress={onClose}
            >
              <Text style={settingsStyles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ paddingBottom: 20 }}
          >
            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Current Habit</Text>
              {isEditingName ? (
                <View style={settingsStyles.editContainer}>
                  <TextInput
                    style={settingsStyles.habitNameInput}
                    value={tempHabitName}
                    onChangeText={setTempHabitName}
                    placeholder="Enter habit name"
                    maxLength={30}
                    autoFocus={true}
                    onSubmitEditing={saveHabitName}
                    returnKeyType="done"
                  />
                  <Text style={settingsStyles.charCount}>
                    {tempHabitName.length}/30 characters
                  </Text>
                  <View style={settingsStyles.editButtonsContainer}>
                    <TouchableOpacity
                      style={[
                        settingsStyles.editButton,
                        settingsStyles.saveButton,
                      ]}
                      onPress={saveHabitName}
                    >
                      <Text style={settingsStyles.saveButtonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        settingsStyles.editButton,
                        settingsStyles.cancelButton,
                      ]}
                      onPress={() => setIsEditingName(false)}
                    >
                      <Text style={settingsStyles.cancelButtonText}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={settingsStyles.settingItem}
                  onPress={() => setIsEditingName(true)}
                >
                  <Text style={settingsStyles.settingItemText}>
                    {habitName}
                  </Text>
                  <Text style={settingsStyles.settingItemSubtext}>
                    Tap to edit
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Premium</Text>
              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={() => {
                  onClose(); // Close settings first
                  onUpgradePremium();
                }}
              >
                <Text style={settingsStyles.settingItemText}>
                  Upgrade to Premium
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Unlimited habits, themes, and more
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={() => {
                  onRestorePurchases();
                }}
              >
                <Text style={settingsStyles.settingItemText}>
                  Restore Purchases
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Already purchased? Restore your subscription
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Data</Text>
              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={() => {
                  Alert.alert(
                    'Clear This Month',
                    'Remove all checkmarks from this month?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear Month',
                        style: 'destructive',
                        onPress: () => {
                          const today = new Date();
                          const currentMonth = today.getMonth();
                          const currentYear = today.getFullYear();

                          setHabitData(prevData => {
                            const habitData = prevData[selectedHabit.id] || {};
                            const updatedHabitData = { ...habitData };

                            // Remove all entries from current month
                            Object.keys(updatedHabitData).forEach(date => {
                              const dateObj = new Date(date + 'T00:00:00'); // Fix timezone issues
                              if (
                                dateObj.getMonth() === currentMonth &&
                                dateObj.getFullYear() === currentYear
                              ) {
                                delete updatedHabitData[date];
                              }
                            });

                            return {
                              ...prevData,
                              [selectedHabit.id]: updatedHabitData,
                            };
                          });

                          onClose();
                        },
                      },
                    ]
                  );
                }}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    settingsStyles.dangerText,
                  ]}
                >
                  Clear This Month
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Remove all checkmarks from current month
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={() => {
                  Alert.alert(
                    'Clear All Data',
                    'Remove ALL checkmarks from this habit?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear All',
                        style: 'destructive',
                        onPress: () => {
                          setHabitData(prevData => ({
                            ...prevData,
                            [selectedHabit.id]: {},
                          }));
                          onClose();
                        },
                      },
                    ]
                  );
                }}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    settingsStyles.dangerText,
                  ]}
                >
                  Clear All Checkmarks
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Remove all checkmarks from this habit
                </Text>
              </TouchableOpacity>
              {habitsList.length > 1 && (
                <TouchableOpacity
                  style={settingsStyles.settingItem}
                  onPress={() => {
                    Alert.alert(
                      'Clear All Habits Data',
                      'Remove ALL checkmarks from ALL habits?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clear All',
                          style: 'destructive',
                          onPress: () => {
                            const clearedData = {};
                            habitsList.forEach(habit => {
                              clearedData[habit.id] = {};
                            });
                            setHabitData(clearedData);
                            onClose();
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text
                    style={[
                      settingsStyles.settingItemText,
                      settingsStyles.dangerText,
                    ]}
                  >
                    Clear All Habits
                  </Text>
                  <Text style={settingsStyles.settingItemSubtext}>
                    Remove all checkmarks from all habits
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Notifications</Text>
              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={async () => {
                  const hasPermission = await requestNotificationPermissions();
                  if (hasPermission) {
                    Alert.alert(
                      'Set Reminder Time',
                      'Choose when to receive daily reminders',
                      [
                        {
                          text: 'Morning (9 AM)',
                          onPress: async () => {
                            const result = await scheduleDailyReminder(9, 0);
                            if (result.success) {
                              Alert.alert(
                                'Success!',
                                "Daily reminder set for 9:00 AM. You'll receive notifications every day at this time.",
                                [{ text: 'Great!' }]
                              );
                            } else {
                              Alert.alert(
                                'Error',
                                'Could not schedule reminder. Please try again.'
                              );
                            }
                          },
                        },
                        {
                          text: 'Evening (8 PM)',
                          onPress: async () => {
                            const result = await scheduleDailyReminder(20, 0);
                            if (result.success) {
                              Alert.alert(
                                'Success!',
                                "Daily reminder set for 8:00 PM. You'll receive notifications every day at this time.",
                                [{ text: 'Great!' }]
                              );
                            } else {
                              Alert.alert(
                                'Error',
                                'Could not schedule reminder. Please try again.'
                              );
                            }
                          },
                        },
                        {
                          text: 'Night (9 PM)',
                          onPress: async () => {
                            const result = await scheduleDailyReminder(21, 0);
                            if (result.success) {
                              Alert.alert(
                                'Success!',
                                "Daily reminder set for 9:00 PM. You'll receive notifications every day at this time.",
                                [{ text: 'Great!' }]
                              );
                            } else {
                              Alert.alert(
                                'Error',
                                'Could not schedule reminder. Please try again.'
                              );
                            }
                          },
                        },
                        {
                          text: 'Cancel',
                          style: 'cancel',
                        },
                      ]
                    );
                  } else {
                    Alert.alert(
                      'Notifications Disabled',
                      'Please enable notifications in your device settings to receive daily reminders.',
                      [
                        {
                          text: 'Open Settings',
                          onPress: () => Linking.openSettings(),
                        },
                        {
                          text: 'Cancel',
                          style: 'cancel',
                        },
                      ]
                    );
                  }
                }}
              >
                <Text style={settingsStyles.settingItemText}>
                  Daily Reminders
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Get reminded to complete your habits
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={async () => {
                  await Notifications.cancelAllScheduledNotificationsAsync();
                  Alert.alert(
                    'Success',
                    'Daily reminders have been turned off.'
                  );
                }}
              >
                <Text style={settingsStyles.settingItemText}>
                  Turn Off Reminders
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Stop receiving daily notifications
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Data Export</Text>

              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={exportUserData}
              >
                <Text style={settingsStyles.settingItemText}>
                  Export My Data
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Download all your habit data
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Support</Text>

              {/* Terms of Use */}
              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={() =>
                  Linking.openURL('https://ktforge.dev/habittracker-eula.html')
                }
              >
                <Text style={settingsStyles.settingItemText}>Terms of Use</Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  View our license agreement
                </Text>
              </TouchableOpacity>

              {/* Privacy Policy */}
              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={() =>
                  Linking.openURL(
                    'https://ktforge.dev/habittracker-privacy.html'
                  )
                }
              >
                <Text style={settingsStyles.settingItemText}>
                  Privacy Policy
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  View our privacy policy
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={settingsStyles.settingItem}
                onPress={async () => {
                  try {
                    const supported = await Linking.canOpenURL(
                      'mailto:habittracker.ktforge@outlook.com'
                    );
                    if (supported) {
                      await Linking.openURL(
                        'mailto:habittracker.ktforge@outlook.com?subject=HabitTracker Support'
                      );
                    } else {
                      Alert.alert(
                        'No Email Client',
                        'Please email us at: habittracker.ktforge@outlook.com',
                        [
                          {
                            text: 'Copy Email',
                            onPress: () => {
                              // This will at least show them the email
                              Alert.alert(
                                'Email Copied',
                                'habittracker.ktforge@outlook.com'
                              );
                            },
                          },
                          { text: 'OK' },
                        ]
                      );
                    }
                  } catch (error) {
                    Alert.alert('Error', 'Could not open email client');
                  }
                }}
              >
                <Text style={settingsStyles.settingItemText}>
                  Contact Support
                </Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Get help with the app
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[settingsStyles.settingsSection, { marginBottom: 40 }]}
            >
              <Text style={settingsStyles.sectionTitle}>About</Text>
              <View style={settingsStyles.settingItem}>
                <Text style={settingsStyles.settingItemText}>HabitTracker</Text>
                <Text style={settingsStyles.settingItemSubtext}>
                  Version 1.0 - Multi-Habit Edition
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// CalendarGrid component (inline to avoid import issues)
const CalendarGrid = ({
  habitData,
  selectedHabit,
  onDayPress,
  onSettingsPress,
  onTodayPress,
  isPremium,
}) => {
  // State to track which month we're currently viewing
  const [viewDate, setViewDate] = useState(new Date()); // Starts with current month

  // Navigate to previous month
  const goToPreviousMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setViewDate(newDate);
  };

  // Navigate to next month
  const goToNextMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setViewDate(newDate);
  };

  // Go back to current month
  const goToCurrentMonth = () => {
    setViewDate(new Date());
  };

  // Generate array of days for the month being viewed
  const generateDays = () => {
    const days = [];
    const today = new Date();
    const todayString = getLocalDateString(today); // Today's date string for comparison

    // Get first and last day of the month being viewed
    const viewMonth = viewDate.getMonth();
    const viewYear = viewDate.getFullYear();
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0); // 0th day of next month = last day of current month

    // Check if we're viewing the current month
    const isCurrentMonth =
      viewMonth === today.getMonth() && viewYear === today.getFullYear();

    // Generate all days in the month being viewed
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const date = new Date(viewYear, viewMonth, day);
      const dateString = getLocalDateString(date); // Format: YYYY-MM-DD
      const dayNumber = date.getDate();
      const monthName = date.toLocaleDateString('en-US', { month: 'short' }); // Jun, Jul, etc.
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue, etc.
      const isToday = isCurrentMonth && dateString === todayString; // Only highlight today in current month
      const isFuture = date > today && dateString !== todayString; // Mark future dates

      // Get habit status for this day (from props or default to 'none')
      const status = habitData[dateString] || 'none';

      days.push({
        date: dateString,
        day: dayNumber,
        monthName: monthName,
        dayName: dayName,
        isToday: isToday,
        isFuture: isFuture,
        status: status, // 'completed', 'missed', 'broken', or 'none'
      });
    }
    return days;
  };

  // Calculate current streak (consecutive days from today backwards)
  const calculateCurrentStreak = () => {
    const today = new Date();
    const trackingDays = selectedHabit.trackingDays || [0, 1, 2, 3, 4, 5, 6];
    let streak = 0;
    let currentDate = new Date(today);
    let foundFirstTrackingDay = false;

    // Go backwards from today, looking for tracking days only
    for (let i = 0; i < 365; i++) {
      const dateString = getLocalDateString(currentDate);
      const dayOfWeek = currentDate.getDay();

      // Only check days that are in the tracking schedule
      if (trackingDays.includes(dayOfWeek)) {
        const status = habitData[dateString];

        if (status === 'completed') {
          streak++;
          foundFirstTrackingDay = true;
        } else if (foundFirstTrackingDay) {
          // We found a tracking day that should have been completed but wasn't
          // This breaks the streak
          break;
        }
        // If we haven't found the first tracking day yet and this one isn't completed,
        // keep looking backwards (user might start tracking mid-week)
      }

      // Move to previous day
      currentDate.setDate(currentDate.getDate() - 1);
    }

    return streak;
  };

  // Calculate longest streak ever
  const calculateLongestStreak = () => {
    const trackingDays = selectedHabit.trackingDays || [0, 1, 2, 3, 4, 5, 6];

    // Get all completed dates, sorted chronologically
    const completedDates = Object.keys(habitData)
      .filter(date => habitData[date] === 'completed')
      .sort();

    if (completedDates.length === 0) return 0;

    let longestStreak = 0;
    let currentStreak = 0;
    let lastCompletedTrackingDate = null;

    // Go through each completed date
    for (let i = 0; i < completedDates.length; i++) {
      const currentDate = new Date(completedDates[i] + 'T00:00:00');
      const currentDayOfWeek = currentDate.getDay();

      // Skip if this isn't a tracking day (shouldn't happen, but safety check)
      if (!trackingDays.includes(currentDayOfWeek)) continue;

      if (lastCompletedTrackingDate === null) {
        // First tracking day
        currentStreak = 1;
      } else {
        // Check if this is the next expected tracking day
        let expectedDate = new Date(lastCompletedTrackingDate);
        let foundNextTrackingDay = false;

        // Look for the next tracking day after the last completed one
        for (let j = 0; j < 7; j++) {
          expectedDate.setDate(expectedDate.getDate() + 1);
          const expectedDayOfWeek = expectedDate.getDay();

          if (trackingDays.includes(expectedDayOfWeek)) {
            // This is the next tracking day
            if (getLocalDateString(expectedDate) === completedDates[i]) {
              // User completed the next expected tracking day - streak continues
              currentStreak++;
              foundNextTrackingDay = true;
            } else {
              // User missed the next expected tracking day - streak resets
              currentStreak = 1;
            }
            break;
          }
        }

        if (!foundNextTrackingDay) {
          // Shouldn't happen, but reset streak if we can't find next tracking day
          currentStreak = 1;
        }
      }

      longestStreak = Math.max(longestStreak, currentStreak);
      lastCompletedTrackingDate = currentDate;
    }

    return longestStreak;
  };

  // Determine what color to show based on habit status
  const getStatusColor = status => {
    switch (status) {
      case 'completed':
        return '#4CAF50'; // Green - habit completed
      case 'missed':
        return '#FFCDD2'; // Light red - habit missed (detected gap)
      case 'broken':
        return '#F44336'; // Red - streak broken
      default:
        return 'transparent'; // Transparent - no data/future days
    }
  };

  // Get the symbol to show for each status
  const getStatusSymbol = status => {
    switch (status) {
      case 'completed':
        return '✓'; // Checkmark for completed
      case 'missed':
        return '✗'; // X for missed days
      case 'broken':
        return '!'; // Exclamation for broken streak
      default:
        return ''; // No symbol for empty days
    }
  };

  const days = generateDays();
  const calculatedHabitData = habitData; // Remove gap detection entirely

  // Calculate streaks
  const currentStreak = calculateCurrentStreak();
  const longestStreak = calculateLongestStreak();

  // Calculate monthly progress stats
  const calculateMonthlyProgress = () => {
    const today = new Date();
    const viewMonth = viewDate.getMonth();
    const viewYear = viewDate.getFullYear();
    const isCurrentMonth =
      viewMonth === today.getMonth() && viewYear === today.getFullYear();

    // Get total days in the month being viewed
    const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // For current month, only count days up to today
    // For past months, count all days
    // For future months, count no days (shouldn't happen but safety)
    let daysToCount;
    if (isCurrentMonth) {
      daysToCount = today.getDate(); // Only count up to today
    } else if (viewDate < today) {
      daysToCount = totalDaysInMonth; // Past month - count all days
    } else {
      daysToCount = 0; // Future month - count no days
    }

    // Count completed days in the range we're considering
    let completedDays = 0;
    for (let day = 1; day <= daysToCount; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const dateString = getLocalDateString(date);
      if (habitData[dateString] === 'completed') {
        completedDays++;
      }
    }

    const percentage =
      daysToCount > 0 ? Math.round((completedDays / daysToCount) * 100) : 0;

    return {
      completedDays,
      totalDays: daysToCount,
      totalDaysInMonth,
      percentage,
      isCurrentMonth,
    };
  };

  const monthlyProgress = calculateMonthlyProgress();

  // Get today's status for the quick complete button
  const today = new Date();
  const todayString = getLocalDateString();
  const todayStatus = habitData[todayString] || 'none';
  const isTodayCompleted = todayStatus === 'completed';
  const todayDayOfWeek = today.getDay();
  const isTodayTrackingDay =
    selectedHabit.trackingDays?.includes(todayDayOfWeek) ?? true;

  // Get month/year for display
  const currentMonth = viewDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const isCurrentMonth =
    viewDate.getMonth() === today.getMonth() &&
    viewDate.getFullYear() === today.getFullYear();

  return (
    <View style={calendarStyles.container}>
      {/* Monthly Progress Stats - Premium Feature */}
      {isPremium ? (
        <View style={calendarStyles.progressSection}>
          <Text style={calendarStyles.progressTitle}>
            {monthlyProgress.completedDays} of {monthlyProgress.totalDays} days
            completed
            {monthlyProgress.isCurrentMonth ? ' this month' : ''}
          </Text>
          <Text
            style={[
              calendarStyles.progressPercentage,
              { color: selectedHabit?.color || '#4CAF50' },
            ]}
          >
            {monthlyProgress.percentage}%
          </Text>

          {/* Progress Bar */}
          <View style={calendarStyles.progressBarContainer}>
            <View style={calendarStyles.progressBarBackground}>
              <View
                style={[
                  calendarStyles.progressBarFill,
                  {
                    width: `${monthlyProgress.percentage}%`,
                    backgroundColor: selectedHabit?.color || '#4CAF50',
                  },
                ]}
              />
            </View>
          </View>

          {/* Progress Text */}
          <Text style={calendarStyles.progressSubtext}>
            {monthlyProgress.percentage >= 80
              ? '🔥 Amazing progress!'
              : monthlyProgress.percentage >= 60
                ? '💪 Great job!'
                : monthlyProgress.percentage >= 40
                  ? '📈 Keep going!'
                  : monthlyProgress.percentage > 0
                    ? '🌱 Every day counts!'
                    : monthlyProgress.isCurrentMonth
                      ? '✨ Start your journey!'
                      : 'No progress this month'}
          </Text>
        </View>
      ) : (
        <View style={calendarStyles.progressSection}>
          <TouchableOpacity style={calendarStyles.premiumLockContainer}>
            <Text style={calendarStyles.premiumLockText}>
              📊 Monthly Progress
            </Text>
            <Text style={calendarStyles.premiumLockSubtext}>
              Upgrade to Premium to see detailed progress stats
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Complete Today Button - Only show when viewing current month */}
      {isCurrentMonth && (
        <View style={calendarStyles.todayButtonSection}>
          <TouchableOpacity
            style={[
              calendarStyles.todayButton,
              isTodayCompleted
                ? calendarStyles.todayButtonCompleted
                : !isTodayTrackingDay
                  ? calendarStyles.todayButtonDisabled
                  : [
                      calendarStyles.todayButtonIncomplete,
                      { backgroundColor: selectedHabit?.color || '#4CAF50' },
                    ],
            ]}
            onPress={() =>
              isTodayTrackingDay && onTodayPress && onTodayPress(todayString)
            }
            disabled={!isTodayTrackingDay}
          >
            <Text
              style={[
                calendarStyles.todayButtonText,
                isTodayCompleted
                  ? calendarStyles.todayButtonTextCompleted
                  : !isTodayTrackingDay
                    ? calendarStyles.todayButtonTextDisabled
                    : calendarStyles.todayButtonTextIncomplete,
              ]}
            >
              {!isTodayTrackingDay
                ? 'Not scheduled today'
                : isTodayCompleted
                  ? '✓ Completed Today!'
                  : '✓ Mark Today Complete'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Motivational Quote */}
      <View style={calendarStyles.motivationSection}>
        <Text style={calendarStyles.motivationQuote}>
          {getStreakQuote(currentStreak, selectedHabit?.trackingDays)}
        </Text>
      </View>

      {/* Streak Display */}
      <View style={calendarStyles.streakContainer}>
        <View style={calendarStyles.streakCard}>
          <Text style={calendarStyles.streakNumber}>{currentStreak}</Text>
          <Text style={calendarStyles.streakLabel}>Current Streak</Text>
          <Text style={calendarStyles.streakSubtext}>
            {currentStreak === 0
              ? 'Start today!'
              : currentStreak === 1
                ? 'day'
                : 'days in a row'}
          </Text>
        </View>

        <View style={calendarStyles.streakCard}>
          <Text
            style={[
              calendarStyles.streakNumber,
              calendarStyles.bestStreakNumber,
            ]}
          >
            {longestStreak}
          </Text>
          <Text style={calendarStyles.streakLabel}>Best Streak</Text>
          <Text style={calendarStyles.streakSubtext}>
            {longestStreak === 0
              ? 'No streak yet'
              : longestStreak === 1
                ? 'day'
                : 'days total'}
          </Text>
        </View>
      </View>

      {/* Month Navigation */}
      <View style={calendarStyles.monthNavigation}>
        <TouchableOpacity
          style={calendarStyles.navButton}
          onPress={goToPreviousMonth}
        >
          <Text style={calendarStyles.navButtonText}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={calendarStyles.monthDisplay}
          onPress={goToCurrentMonth}
        >
          <Text
            style={[
              calendarStyles.currentMonth,
              !isCurrentMonth && calendarStyles.pastMonth,
            ]}
          >
            {currentMonth}
          </Text>
          {!isCurrentMonth && (
            <Text style={calendarStyles.todayHint}>
              Tap to go to current month
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={calendarStyles.navButton}
          onPress={goToNextMonth}
        >
          <Text style={calendarStyles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Grid of days */}
      <View style={calendarStyles.grid}>
        {days.map((dayData, index) => {
          const calculatedStatus = habitData[dayData.date] || 'none';

          // Check if this day is part of the habit's tracking schedule
          const dayOfWeek = new Date(dayData.date + 'T00:00:00').getDay();
          const isTrackingDay =
            selectedHabit.trackingDays?.includes(dayOfWeek) ?? true;

          return (
            <TouchableOpacity
              key={dayData.date}
              style={[
                calendarStyles.dayContainer,
                dayData.isToday && calendarStyles.todayContainer,
                !isTrackingDay && calendarStyles.nonTrackingDay,
              ]}
              onPress={() => (isTrackingDay ? onDayPress(dayData.date) : null)}
              disabled={dayData.isFuture || !isTrackingDay}
            >
              {/* Day name (Mon, Tue, etc.) */}
              <Text
                style={[
                  calendarStyles.dayName,
                  dayData.isToday && calendarStyles.todayText,
                  dayData.isFuture && calendarStyles.futureText,
                ]}
              >
                {dayData.dayName}
              </Text>

              {/* Day number and month */}
              <Text
                style={[
                  calendarStyles.dayNumber,
                  dayData.isToday && calendarStyles.todayText,
                  dayData.isFuture && calendarStyles.futureText,
                ]}
              >
                {dayData.monthName} {dayData.day}
              </Text>

              {/* Status indicator (checkmark, X, or empty) - only show for non-future days */}
              {!dayData.isFuture && (
                <View
                  style={[
                    calendarStyles.statusIndicator,
                    { backgroundColor: getStatusColor(calculatedStatus) },
                  ]}
                >
                  <Text
                    style={[
                      calendarStyles.statusSymbol,
                      {
                        color:
                          calculatedStatus === 'missed' ? '#D32F2F' : '#FFFFFF',
                      },
                    ]}
                  >
                    {getStatusSymbol(calculatedStatus)}
                  </Text>
                </View>
              )}

              {/* Future day indicator */}
              {dayData.isFuture && (
                <View style={calendarStyles.futureIndicator}>
                  <Text style={calendarStyles.futureSymbol}>•</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={calendarStyles.legend}>
        <View style={calendarStyles.legendItem}>
          <View
            style={[calendarStyles.legendDot, { backgroundColor: '#4CAF50' }]}
          >
            <Text style={calendarStyles.legendSymbol}>✓</Text>
          </View>
          <Text style={calendarStyles.legendText}>Completed</Text>
        </View>
        <View style={calendarStyles.legendItem}>
          <View
            style={[
              calendarStyles.legendDot,
              {
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: '#E0E0E0',
              },
            ]}
          >
            <Text style={[calendarStyles.legendSymbol, { color: '#999' }]}>
              ○
            </Text>
          </View>
          <Text style={calendarStyles.legendText}>Not marked</Text>
        </View>
        <View style={calendarStyles.legendItem}>
          <View
            style={[
              calendarStyles.legendDot,
              { backgroundColor: 'transparent' },
            ]}
          >
            <Text style={[calendarStyles.legendSymbol, { color: '#DDD' }]}>
              •
            </Text>
          </View>
          <Text style={calendarStyles.legendText}>Future</Text>
        </View>
      </View>
    </View>
  );
};

// Main component
export default function HomeScreen() {
  // Initialize with empty data - we'll load from storage
  const [habitData, setHabitData] = useState({}); // { habitId: { date: status } }
  const [habitsList, setHabitsList] = useState([]); // Array of habit objects
  const [selectedHabitId, setSelectedHabitId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [showEditHabit, setShowEditHabit] = useState(false);
  const [isPremium, setIsPremium] = useState(false); // Start as false, load from storage

  const selectedHabit =
    habitsList.find(h => h.id === selectedHabitId) || habitsList[0];
  const currentHabitData = selectedHabitId
    ? habitData[selectedHabitId] || {}
    : {};

  // Save habit data to AsyncStorage
  const saveHabitData = async data => {
    try {
      const jsonData = JSON.stringify(data);
      await AsyncStorage.setItem(HABIT_DATA_KEY, jsonData);
      console.log('Habit data saved successfully');
    } catch (error) {
      console.error('Error saving habit data:', error);
    }
  };

  // Save habits list to AsyncStorage
  const saveHabitsList = async habits => {
    try {
      const jsonData = JSON.stringify(habits);
      await AsyncStorage.setItem(HABITS_LIST_KEY, jsonData);
      console.log('Habits list saved successfully');
    } catch (error) {
      console.error('Error saving habits list:', error);
    }
  };

  // Save selected habit to AsyncStorage
  const saveSelectedHabit = async habitId => {
    try {
      await AsyncStorage.setItem(SELECTED_HABIT_KEY, habitId);
      console.log('Selected habit saved successfully');
    } catch (error) {
      console.error('Error saving selected habit:', error);
    }
  };

  // Save premium status to AsyncStorage
  const savePremiumStatus = async status => {
    try {
      await AsyncStorage.setItem(PREMIUM_STATUS_KEY, status ? 'true' : 'false');
      console.log('Premium status saved:', status);
    } catch (error) {
      console.error('Error saving premium status:', error);
    }
  };

  // Load all data from AsyncStorage
  const loadAllData = async () => {
    try {
      // Load all data in parallel
      const [habitDataJson, habitsListJson, selectedHabitId, premiumStatus] =
        await Promise.all([
          AsyncStorage.getItem(HABIT_DATA_KEY),
          AsyncStorage.getItem(HABITS_LIST_KEY),
          AsyncStorage.getItem(SELECTED_HABIT_KEY),
          AsyncStorage.getItem(PREMIUM_STATUS_KEY),
        ]);

      // Set premium status
      if (premiumStatus === 'true') {
        setIsPremium(true);
      }

      // Parse habits list
      let habits = [];
      if (habitsListJson !== null) {
        habits = JSON.parse(habitsListJson);
        setHabitsList(habits);
        console.log('Habits list loaded successfully');
      }

      // Parse habit data
      if (habitDataJson !== null) {
        const data = JSON.parse(habitDataJson);
        setHabitData(data);
        console.log('Habit data loaded successfully');
      }

      // Set selected habit
      if (
        selectedHabitId !== null &&
        habits.find(h => h.id === selectedHabitId)
      ) {
        setSelectedHabitId(selectedHabitId);
      } else if (habits.length > 0) {
        setSelectedHabitId(habits[0].id);
      }

      // If no habits exist, create first habit for new users
      if (habits.length === 0) {
        createFirstHabit();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      createFirstHabit();
    } finally {
      setIsLoading(false);
    }
  };

  // Improved purchase history check
  const checkAndRestoreExistingPurchases = async () => {
    try {
      const history = await IAP.getPurchaseHistoryAsync();
      console.log(
        '🔍 [IAP DEBUG] Purchase history response:',
        history.responseCode
      );

      if (history.responseCode === IAP.IAPResponseCode.OK && history.results) {
        console.log('🔍 [IAP DEBUG] Purchase history:', history.results);

        // Check if user has active subscription
        const hasActiveSubscription = history.results.some(purchase => {
          const isValidProduct =
            purchase.productId === PRODUCT_IDS.MONTHLY ||
            purchase.productId === PRODUCT_IDS.YEARLY;
          const isAcknowledged = purchase.acknowledged;

          console.log('🔍 [IAP DEBUG] Checking purchase:', {
            productId: purchase.productId,
            acknowledged: isAcknowledged,
            isValidProduct,
          });

          return isValidProduct && isAcknowledged;
        });

        if (hasActiveSubscription) {
          console.log(
            '✅ [IAP DEBUG] Found active subscription, enabling premium'
          );
          setIsPremium(true);
          await savePremiumStatus(true);
        }
      }
    } catch (error) {
      console.log('❌ [IAP DEBUG] Error checking purchase history:', error);
    }
  };

  // Initialize in-app purchases (real implementation)
  const initializePurchases = async () => {
    try {
      if (Platform.OS !== 'ios') {
        console.log('IAP only supported on iOS currently');
        return;
      }

      console.log('🔍 [IAP DEBUG] Initializing IAP...');

      const { responseCode, results } = await IAP.connectAsync();
      console.log('🔍 [IAP DEBUG] Connect response:', responseCode);

      if (responseCode === IAP.IAPResponseCode.OK) {
        console.log('✅ [IAP DEBUG] Connected to App Store successfully');

        // Set purchase listener with comprehensive logging
        IAP.setPurchaseListener(({ responseCode, results, errorCode }) => {
          console.log('🔍 [IAP DEBUG] Purchase listener triggered:', {
            responseCode,
            errorCode,
            resultsCount: results?.length || 0,
          });

          if (
            responseCode === IAP.IAPResponseCode.OK &&
            results &&
            results.length > 0
          ) {
            console.log('✅ [IAP DEBUG] Processing purchase results...');
            results.forEach((purchase, index) => {
              console.log(`🔍 [IAP DEBUG] Purchase ${index + 1}:`, {
                productId: purchase.productId,
                acknowledged: purchase.acknowledged,
                transactionId: purchase.transactionId,
              });

              if (!purchase.acknowledged) {
                handleSuccessfulPurchase(purchase);
              } else {
                console.log(
                  'ℹ️ [IAP DEBUG] Purchase already acknowledged, skipping'
                );
              }
            });
          } else if (responseCode === IAP.IAPResponseCode.USER_CANCELED) {
            console.log('ℹ️ [IAP DEBUG] Purchase listener: User cancelled');
          } else if (responseCode === IAP.IAPResponseCode.ERROR) {
            console.log('❌ [IAP DEBUG] Purchase listener error:', errorCode);
          } else {
            console.log(
              '❓ [IAP DEBUG] Purchase listener unknown response:',
              responseCode
            );
          }
        });

        // Check purchase history
        await checkAndRestoreExistingPurchases();
      } else {
        console.log(
          '❌ [IAP DEBUG] Failed to connect to App Store:',
          responseCode
        );
      }
    } catch (error) {
      console.log('💥 [IAP DEBUG] Error initializing IAP:', error);
    }
  };

  // Handle successful purchase
  const handleSuccessfulPurchase = async purchase => {
    try {
      console.log('✅ [IAP DEBUG] Handling successful purchase:', {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        acknowledged: purchase.acknowledged,
      });

      // Validate it's one of our products
      if (
        purchase.productId !== PRODUCT_IDS.MONTHLY &&
        purchase.productId !== PRODUCT_IDS.YEARLY
      ) {
        console.log(
          '❌ [IAP DEBUG] Unknown product ID in purchase:',
          purchase.productId
        );
        return;
      }

      // Check if already acknowledged
      if (purchase.acknowledged) {
        console.log('ℹ️ [IAP DEBUG] Purchase already acknowledged');
        setIsPremium(true);
        await savePremiumStatus(true);
        return;
      }

      console.log('🔍 [IAP DEBUG] Validating receipt...');

      // Validate receipt with sandbox fallback
      if (purchase.transactionReceipt) {
        console.log('🔍 [IAP DEBUG] Starting receipt validation...');
        const validation = await IAP.validateReceipt(
          purchase.transactionReceipt
        );

        if (!validation || !validation.success) {
          console.log('❌ [IAP DEBUG] Receipt validation failed:', validation);

          // Check if it's a specific known error
          let errorMessage =
            'Could not verify your purchase. Please try again.';
          if (validation && validation.status) {
            switch (validation.status) {
              case 21002:
                errorMessage = 'Invalid receipt data. Please try again.';
                break;
              case 21003:
                errorMessage = 'Authentication error. Please try again.';
                break;
              case 21004:
                errorMessage = 'Invalid shared secret. Please contact support.';
                break;
              case 21005:
                errorMessage =
                  'Receipt server is unavailable. Please try again later.';
                break;
              case 21008:
                errorMessage = 'This receipt has already been used.';
                break;
              default:
                errorMessage = `Validation failed (Error ${validation.status}). Please contact support.`;
            }
          }

          Alert.alert('Purchase Error', errorMessage);

          // Still finish the transaction to prevent it from being stuck
          await IAP.finish(purchase);
          return;
        }

        console.log('✅ [IAP DEBUG] Receipt validated successfully');
        console.log(
          '🔍 [IAP DEBUG] Receipt environment:',
          validation.data?.environment || 'Unknown'
        );
      }

      console.log('🔍 [IAP DEBUG] Finishing transaction...');

      // Finish the transaction
      await IAP.finish(purchase);
      console.log('✅ [IAP DEBUG] Transaction finished successfully');

      // Enable premium features
      setIsPremium(true);
      await savePremiumStatus(true);

      // Show success message
      Alert.alert(
        'Welcome to Premium! 🎉',
        'You now have access to unlimited habits and all premium features.',
        [{ text: 'Awesome!' }]
      );
    } catch (error) {
      console.error('💥 [IAP DEBUG] Error handling purchase:', error);
      Alert.alert(
        'Purchase Error',
        'There was an issue processing your purchase. Please try again or contact support.'
      );
    }
    try {
      console.log('✅ [IAP DEBUG] Handling successful purchase:', {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        acknowledged: purchase.acknowledged,
      });

      // Validate it's one of our products
      if (
        purchase.productId !== PRODUCT_IDS.MONTHLY &&
        purchase.productId !== PRODUCT_IDS.YEARLY
      ) {
        console.log(
          '❌ [IAP DEBUG] Unknown product ID in purchase:',
          purchase.productId
        );
        return;
      }

      // Check if already acknowledged
      if (purchase.acknowledged) {
        console.log('ℹ️ [IAP DEBUG] Purchase already acknowledged');
        // Still enable premium in case it wasn't saved properly
        setIsPremium(true);
        await savePremiumStatus(true);
        return;
      }

      console.log('🔍 [IAP DEBUG] Acknowledging purchase...');

      // Acknowledge the purchase (finish the transaction)
      const finishResult = await IAP.finishTransactionAsync(purchase, true);
      console.log(
        '🔍 [IAP DEBUG] Finish transaction result:',
        finishResult.responseCode
      );

      if (finishResult.responseCode === IAP.IAPResponseCode.OK) {
        console.log('✅ [IAP DEBUG] Purchase acknowledged successfully');

        // Enable premium features
        setIsPremium(true);
        await savePremiumStatus(true);

        // Show success message
        Alert.alert(
          'Welcome to Premium! 🎉',
          'You now have access to unlimited habits and all premium features.',
          [{ text: 'Awesome!' }]
        );
      } else {
        console.log(
          '❌ [IAP DEBUG] Failed to acknowledge purchase:',
          finishResult.responseCode
        );
        Alert.alert(
          'Purchase Successful',
          "Your purchase was successful but there was an issue activating premium features. Please use 'Restore Purchases' in settings or restart the app."
        );
      }

      if (responseCode === IAP.IAPResponseCode.OK) {
        // Unlock premium features
        setIsPremium(true);
        await savePremiumStatus(true);

        Alert.alert(
          'Welcome to Premium! 🎉',
          'You now have access to unlimited habits and all premium features.',
          [{ text: 'Awesome!' }]
        );
      }
    } catch (error) {
      console.error('Error acknowledging purchase:', error);
    }
  };

  // Handle subscription purchase (real implementation)
  const purchaseSubscription = async productId => {
    try {
      console.log('🔍 [IAP DEBUG] Starting purchase for:', productId);

      // Validate product ID first
      if (
        productId !== PRODUCT_IDS.MONTHLY &&
        productId !== PRODUCT_IDS.YEARLY
      ) {
        console.log('❌ [IAP DEBUG] Invalid product ID:', productId);
        Alert.alert('Error', 'Invalid subscription option selected.');
        return;
      }

      // Get product info to verify it exists
      console.log('🔍 [IAP DEBUG] Getting product info...');
      const { responseCode: productResponseCode, results: products } =
        await IAP.getProductsAsync([productId]);

      console.log('🔍 [IAP DEBUG] Product fetch response:', {
        responseCode: productResponseCode,
        products: products?.map(p => ({
          id: p.productId,
          price: p.price,
          title: p.title,
        })),
      });

      if (
        productResponseCode !== IAP.IAPResponseCode.OK ||
        !products ||
        products.length === 0
      ) {
        console.log('❌ [IAP DEBUG] Failed to load product info');
        Alert.alert(
          'Service Unavailable',
          'Could not load subscription information. Please check your internet connection and try again.'
        );
        return;
      }

      const product = products.find(p => p.productId === productId);
      if (!product) {
        console.log('❌ [IAP DEBUG] Product not found in results');
        Alert.alert('Error', 'Subscription option not available.');
        return;
      }

      console.log(
        '✅ [IAP DEBUG] Product found:',
        product.title,
        product.price
      );

      // Now attempt the purchase
      console.log('🔍 [IAP DEBUG] Initiating purchase...');
      const purchaseResult = await IAP.purchaseItemAsync(productId);

      console.log('🔍 [IAP DEBUG] Purchase result:', {
        responseCode: purchaseResult.responseCode,
        errorCode: purchaseResult.errorCode,
        results: purchaseResult.results?.length || 0,
      });

      // Handle the response more specifically
      switch (purchaseResult.responseCode) {
        case IAP.IAPResponseCode.OK:
          console.log(
            '✅ [IAP DEBUG] Purchase successful, listener should handle it'
          );
          break;

        case IAP.IAPResponseCode.USER_CANCELED:
          console.log('ℹ️ [IAP DEBUG] User cancelled purchase');
          break;

        case IAP.IAPResponseCode.ERROR:
          console.log(
            '❌ [IAP DEBUG] Purchase error:',
            purchaseResult.errorCode
          );

          let errorMessage = 'Unable to complete your purchase.';

          if (purchaseResult.errorCode) {
            switch (purchaseResult.errorCode) {
              case 'E_NETWORK_ERROR':
                errorMessage =
                  'Network error. Please check your internet connection and try again.';
                break;
              case 'E_SERVICE_ERROR':
                errorMessage =
                  'App Store service is temporarily unavailable. Please try again later.';
                break;
              case 'E_USER_ERROR':
                errorMessage =
                  'There was an issue with your Apple ID or payment method. Please check your App Store settings.';
                break;
              case 'E_DEVELOPER_ERROR':
                errorMessage =
                  'App configuration error. Please contact support.';
                break;
              case 'E_BILLING_UNAVAILABLE':
                errorMessage =
                  'In-app purchases are not available on this device.';
                break;
              case 'E_ITEM_UNAVAILABLE':
                errorMessage = 'This subscription is temporarily unavailable.';
                break;
              default:
                errorMessage = `Purchase failed (${purchaseResult.errorCode}). Please try again.`;
            }
          }

          Alert.alert('Purchase Failed', errorMessage);
          break;

        case IAP.IAPResponseCode.DEFERRED:
          console.log('⏳ [IAP DEBUG] Purchase deferred (pending approval)');
          Alert.alert(
            'Purchase Pending',
            "Your purchase is pending approval. You'll receive premium features once approved."
          );
          break;

        default:
          console.log(
            '❓ [IAP DEBUG] Unknown purchase response:',
            purchaseResult.responseCode
          );
          Alert.alert(
            'Purchase Issue',
            'An unexpected error occurred. Please try again or contact support if the problem persists.'
          );
      }
    } catch (error) {
      console.error('💥 [IAP DEBUG] Purchase exception:', error);

      let errorMessage = 'Could not complete purchase. Please try again.';

      if (
        error.message?.includes('network') ||
        error.message?.includes('connection')
      ) {
        errorMessage =
          'Network error. Please check your internet connection and try again.';
      } else if (
        error.message?.includes('not available') ||
        error.message?.includes('disabled')
      ) {
        errorMessage =
          'In-app purchases are not available. Please check your device settings.';
      }

      Alert.alert('Purchase Error', errorMessage);
    }
  };

  // Restore purchases function (required by Apple)
  const restorePurchases = async () => {
    try {
      const history = await IAP.getPurchaseHistoryAsync();

      if (history.responseCode === IAP.IAPResponseCode.OK) {
        const hasActiveSubscription = history.results?.some(
          purchase =>
            (purchase.productId === PRODUCT_IDS.MONTHLY ||
              purchase.productId === PRODUCT_IDS.YEARLY) &&
            purchase.acknowledged
        );

        if (hasActiveSubscription) {
          setIsPremium(true);
          await savePremiumStatus(true);
          Alert.alert(
            'Success',
            'Your premium subscription has been restored!'
          );
        } else {
          Alert.alert(
            'No Purchases Found',
            'No previous purchases were found for this Apple ID.'
          );
        }
      } else {
        Alert.alert('Error', 'Could not restore purchases. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
      console.error('Restore error:', error);
    }
  };

  // Create first habit for new users
  const createFirstHabit = () => {
    const firstHabit = {
      id: Date.now().toString(),
      name: 'My Habit',
      color: '#4CAF50',
      createdAt: new Date().toISOString(),
      trackingDays: [0, 1, 2, 3, 4, 5, 6], // Default: track all days (Sunday=0 to Saturday=6)
    };

    const newHabits = [firstHabit];
    setHabitsList(newHabits);
    setSelectedHabitId(firstHabit.id);

    // Create some sample data for the first habit
    const mockData = {};
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const todayDay = today.getDate();

    if (todayDay >= 3) {
      // Create a 3-day streak ending today
      for (let i = 0; i < 3; i++) {
        const date = new Date(currentYear, currentMonth, todayDay - i);
        const dateString = getLocalDateString(date);
        mockData[dateString] = 'completed';
      }
    }

    const newHabitData = { [firstHabit.id]: mockData };
    setHabitData(newHabitData);

    // Save the new data
    saveHabitsList(newHabits);
    saveHabitData(newHabitData);
    saveSelectedHabit(firstHabit.id);
  };

  // ADD this function to test your IAP setup
  const testIAPConnection = async () => {
    try {
      console.log('🧪 [IAP TEST] Testing IAP connection...');

      // Test connection using the correct method names
      const connectResult = await IAP.init();
      console.log('🧪 [IAP TEST] Connect result:', connectResult);

      if (connectResult) {
        // Test product loading using the correct method
        const products = await IAP.getProducts();

        console.log('🧪 [IAP TEST] Products result:', {
          products: products?.map(p => ({
            productId: p.productId,
            price: p.price,
            title: p.title,
          })),
        });

        Alert.alert(
          'IAP Test Results',
          `Connection: ${connectResult ? 'Success' : 'Failed'}\nProducts: ${
            products?.length || 0
          } found\n\nCheck console for details.`
        );
      } else {
        Alert.alert(
          'IAP Test Failed',
          'Connection failed - check console for details'
        );
      }
    } catch (error) {
      console.log('🧪 [IAP TEST] Error:', error);
      console.log('🧪 [IAP TEST] Error message:', error.message);
      console.log('🧪 [IAP TEST] Error string:', String(error));

      if (error.message && error.message.includes('E_IAP_NOT_AVAILABLE')) {
        Alert.alert(
          'IAP Not Available',
          'In-app purchases are not available in this environment (Simulator/Expo Go). This is normal for development.\n\nIAP will work in:\n• TestFlight builds\n• Physical devices with App Store setup'
        );
      } else if (String(error).includes('E_IAP_NOT_AVAILABLE')) {
        Alert.alert(
          'IAP Not Available',
          'In-app purchases are not available in this environment (Simulator/Expo Go). This is normal for development.\n\nIAP will work in:\n• TestFlight builds\n• Physical devices with App Store setup'
        );
      } else {
        Alert.alert('IAP Test Error', error.message || String(error));
      }
    }
  };

  // Load data when component mounts
  useEffect(() => {
    loadAllData();
  }, []);

  // Initialize purchases when component mounts
  useEffect(() => {
    initializePurchases();

    // Cleanup listener on unmount
    return () => {
      if (Platform.OS === 'ios') {
        IAP.disconnectAsync();
      }
    };
  }, []);

  // Set up notifications when app loads
  useEffect(() => {
    const setupNotifications = async () => {
      const hasPermission = await requestNotificationPermissions();
      if (hasPermission) {
        // Schedule for 8 PM by default
        await scheduleDailyReminder(20, 0);
      }
    };

    setupNotifications();
  }, []);

  // Save data whenever habitData changes (but not on initial load)
  useEffect(() => {
    if (!isLoading && Object.keys(habitData).length > 0) {
      saveHabitData(habitData);
    }
  }, [habitData, isLoading]);

  // Save habits list whenever it changes
  useEffect(() => {
    if (!isLoading && habitsList.length > 0) {
      saveHabitsList(habitsList);
    }
  }, [habitsList, isLoading]);

  // Save selected habit whenever it changes
  useEffect(() => {
    if (!isLoading && selectedHabitId) {
      saveSelectedHabit(selectedHabitId);
    }
  }, [selectedHabitId, isLoading]);

  // Save premium status whenever it changes
  useEffect(() => {
    if (!isLoading) {
      savePremiumStatus(isPremium);
    }
  }, [isPremium, isLoading]);

  // Handle adding a new habit
  const handleAddHabit = newHabit => {
    const updatedHabits = [...habitsList, newHabit];
    setHabitsList(updatedHabits);
    setSelectedHabitId(newHabit.id);

    // Initialize empty data for the new habit
    setHabitData(prevData => ({
      ...prevData,
      [newHabit.id]: {},
    }));
  };

  // Handle selecting a different habit
  const handleSelectHabit = habitId => {
    setSelectedHabitId(habitId);
  };

  // Handle updating a habit
  const handleUpdateHabit = updatedHabit => {
    const updatedHabits = habitsList.map(habit =>
      habit.id === updatedHabit.id ? updatedHabit : habit
    );
    setHabitsList(updatedHabits);
  };

  // Handle habit name change (for settings)
  const handleHabitNameChange = newName => {
    if (!selectedHabit) return;

    const updatedHabits = habitsList.map(habit =>
      habit.id === selectedHabit.id ? { ...habit, name: newName } : habit
    );
    setHabitsList(updatedHabits);
  };

  // Handle deleting a habit
  const handleDeleteHabit = habitId => {
    Alert.alert(
      'Delete Habit',
      'Are you sure you want to delete this habit and all its data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Remove from habits list
            const updatedHabits = habitsList.filter(h => h.id !== habitId);
            setHabitsList(updatedHabits);

            // Remove habit data
            const updatedData = { ...habitData };
            delete updatedData[habitId];
            setHabitData(updatedData);

            // Select first remaining habit or null
            if (updatedHabits.length > 0) {
              setSelectedHabitId(updatedHabits[0].id);
            } else {
              setSelectedHabitId(null);
              // Create first habit for empty state
              createFirstHabit();
            }
          },
        },
      ]
    );
  };

  // Handle reset all data
  const handleResetData = async () => {
    try {
      // Clear all AsyncStorage keys
      await Promise.all([
        AsyncStorage.removeItem(HABIT_DATA_KEY),
        AsyncStorage.removeItem(HABITS_LIST_KEY),
        AsyncStorage.removeItem(SELECTED_HABIT_KEY),
        AsyncStorage.removeItem(PREMIUM_STATUS_KEY),
      ]);

      // Reset all state
      setHabitData({});
      setHabitsList([]);
      setSelectedHabitId(null);
      setIsPremium(false);

      // Create first habit again
      setTimeout(() => {
        createFirstHabit();
      }, 100);

      Alert.alert('Success', 'All data has been reset');
      console.log('All data reset successfully');
    } catch (error) {
      console.error('Error resetting data:', error);
      Alert.alert('Error', 'Failed to reset data: ' + error.message);
    }
  };

  const exportUserData = async () => {
    try {
      const readableData = habitsList
        .map(habit => {
          const entries = habitData[habit.id] ?? {};
          const completedDates = Object.keys(entries).filter(
            date => entries[date] === 'completed'
          );

          return `
Habit: ${habit.name}
          Color: ${habit.color}
          Created: ${new Date(habit.createdAt).toLocaleDateString()}
          Days Tracked: ${completedDates.length}
          Dates: ${completedDates.join(', ')}
`.trim();
        })
        .join('\n\n');

      const finalText = `Exported Habit Data\n\n${readableData}\n\nPremium: ${
        isPremium ? 'Yes' : 'No'
      }\nExported: ${new Date().toLocaleString()}`;

      const fileUri = FileSystem.documentDirectory + 'habit_data_export.txt';

      await FileSystem.writeAsStringAsync(fileUri, finalText, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert(
          'Sharing Not Available',
          'The text file was saved but could not be shared.'
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Could not export data. Please try again.');
    }
  };

  // Handle premium upgrade with real IAP
  const handleUpgradePremium = async () => {
    try {
      // Get available products
      const { responseCode, results } = await IAP.getProductsAsync([
        PRODUCT_IDS.MONTHLY,
        PRODUCT_IDS.YEARLY,
      ]);

      if (
        responseCode !== IAP.IAPResponseCode.OK ||
        !results ||
        results.length === 0
      ) {
        Alert.alert(
          'Error',
          'Could not load subscription options. Please try again later.'
        );
        return;
      }

      // Find the products to get real pricing
      const monthlyProduct = results.find(
        p => p.productId === PRODUCT_IDS.MONTHLY
      );
      const yearlyProduct = results.find(
        p => p.productId === PRODUCT_IDS.YEARLY
      );

      // Show subscription options with real pricing
      Alert.alert(
        'Choose Your Plan',
        'Unlock unlimited habits and premium features.\n\nBy subscribing you agree to our Terms of Use (https://ktforge.dev/habittracker-eula.html) and Privacy Policy (https://ktforge.dev/habittracker-privacy.html).',
        [
          {
            text: `Monthly - ${monthlyProduct?.price || '$4.99'}`,
            onPress: () => purchaseSubscription(PRODUCT_IDS.MONTHLY),
          },
          {
            text: `Yearly - ${yearlyProduct?.price || '$29.99'} (Save 50%!)`,
            onPress: () => purchaseSubscription(PRODUCT_IDS.YEARLY),
            style: 'default',
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Unable to load subscriptions. Please check your connection.'
      );
      console.error('Upgrade error:', error);
    }
  };

  // Handle when user taps on a day
  const handleDayPress = date => {
    if (!selectedHabitId) return;

    console.log('Day pressed:', date);

    // Prevent marking future dates
    const today = new Date();
    const selectedDate = new Date(date);
    const todayString = getLocalDateString();

    if (selectedDate > today && date !== todayString) {
      console.log('Cannot mark future dates');
      return; // Don't allow marking future dates
    }

    const currentHabitData = habitData[selectedHabitId] || {};
    const currentStatus = currentHabitData[date] || 'none';

    if (currentStatus === 'completed') {
      // If already completed, ask for confirmation to remove
      Alert.alert('Remove Checkmark', 'Remove this completed day?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setHabitData(prevData => ({
              ...prevData,
              [selectedHabitId]: {
                ...currentHabitData,
                [date]: 'none',
              },
            }));
          },
        },
      ]);
    } else {
      // If not completed (none or missed), mark as completed
      setHabitData(prevData => ({
        ...prevData,
        [selectedHabitId]: {
          ...currentHabitData,
          [date]: 'completed',
        },
      }));
    }
  };

  // Handle quick complete today button
  const handleTodayPress = todayDate => {
    if (!selectedHabitId) return;

    console.log('Today button pressed:', todayDate);
    const currentHabitData = habitData[selectedHabitId] || {};
    const currentStatus = currentHabitData[todayDate] || 'none';
    const newStatus = currentStatus === 'completed' ? 'none' : 'completed';

    setHabitData(prevData => ({
      ...prevData,
      [selectedHabitId]: {
        ...currentHabitData,
        [todayDate]: newStatus,
      },
    }));
  };

  // Show loading screen while data loads
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your habits...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Habit Selector */}
        <View style={styles.habitSelectorContainer}>
          <HabitSelector
            habits={habitsList}
            selectedHabitId={selectedHabitId}
            onSelectHabit={handleSelectHabit}
            onAddHabit={() => setShowAddHabit(true)}
            onDeleteHabit={handleDeleteHabit}
          />

          {/* Edit and Settings Buttons */}
          {selectedHabit && (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setShowEditHabit(true)}
              >
                <Text style={styles.editIcon}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => setShowSettings(true)}
              >
                <Text style={styles.settingsIcon}>⚙️</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Calendar - Only show if we have a selected habit */}
        {selectedHabit && (
          <CalendarGrid
            habitData={currentHabitData}
            selectedHabit={selectedHabit}
            onDayPress={handleDayPress}
            onSettingsPress={() => setShowSettings(true)}
            onTodayPress={handleTodayPress}
            isPremium={isPremium}
          />
        )}
      </ScrollView>
      <SettingsModal
        visible={showSettings}
        habitName={selectedHabit?.name || ''}
        selectedHabit={selectedHabit}
        onClose={() => setShowSettings(false)}
        onHabitNameChange={handleHabitNameChange}
        onResetData={handleResetData}
        onDeleteHabit={handleDeleteHabit}
        onUpgradePremium={handleUpgradePremium}
        onRestorePurchases={restorePurchases}
        habitData={habitData}
        setHabitData={setHabitData}
        habitsList={habitsList}
        exportUserData={exportUserData}
        testIAPConnection={testIAPConnection}
      />

      <AddHabitModal
        visible={showAddHabit}
        onClose={() => setShowAddHabit(false)}
        onAddHabit={handleAddHabit}
        habitCount={habitsList.length}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
      />
      <EditHabitModal
        visible={showEditHabit}
        onClose={() => setShowEditHabit(false)}
        habit={selectedHabit}
        onUpdateHabit={handleUpdateHabit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  habitSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  editButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    marginRight: 8,
  },
  editIcon: {
    fontSize: 18,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  settingsIcon: {
    fontSize: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
  },
});

// Habit Selector Styles
const habitSelectorStyles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
  },
  addFirstHabit: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  addFirstHabitText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  singleHabitContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  habitNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  habitName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 18,
    color: '#666666',
    fontWeight: 'bold',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 8,
  },
  habitTabContainer: {
    position: 'relative',
    marginRight: 8,
  },
  habitTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selectedTab: {
    backgroundColor: '#F0F0F0',
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    marginLeft: 4,
  },
  selectedTabText: {
    color: '#333333',
    fontWeight: '600',
  },
  deleteButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  deleteButtonText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
    lineHeight: 12,
  },
  addTabButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTabButtonText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: 'bold',
  },
});

// Add Habit Modal Styles
const addHabitStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '90%',
    maxHeight: '85%',
    paddingTop: 20,
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666666',
  },
  premiumNotice: {
    backgroundColor: '#FFF3E0',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  premiumText: {
    fontSize: 14,
    color: '#E65100',
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    textAlign: 'right',
  },
  colorSection: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    margin: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: '#333333',
  },
  daySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dayButton: {
    width: 45,
    height: 35,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectedDay: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  selectedDayText: {
    color: '#FFFFFF',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#E0E0E0',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButtonText: {
    color: '#999999',
  },
});

// Calendar component styles
const calendarStyles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  progressSection: {
    marginBottom: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
    marginBottom: 4,
  },
  progressPercentage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 12,
  },
  progressBarContainer: {
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    fontWeight: '500',
  },
  premiumLockContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  premiumLockText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 4,
  },
  premiumLockSubtext: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
  motivationSection: {
    marginBottom: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E3F2FD',
  },
  motivationQuote: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    textAlign: 'center',
    lineHeight: 22,
  },
  nonTrackingDay: {
    backgroundColor: '#FAFAFA',
    opacity: 0.6,
  },
  todayButtonSection: {
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  todayButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  todayButtonIncomplete: {
    // Background color set dynamically based on habit color
  },
  todayButtonCompleted: {
    backgroundColor: '#E8F5E8',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  todayButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  todayButtonTextIncomplete: {
    color: '#FFFFFF',
  },
  todayButtonTextCompleted: {
    color: '#2E7D32',
  },
  todayButtonDisabled: {
    backgroundColor: '#E0E0E0',
    borderWidth: 1,
    borderColor: '#CCCCCC',
  },
  todayButtonTextDisabled: {
    color: '#999999',
  },
  streakContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  streakCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  streakNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  bestStreakNumber: {
    color: '#FF9800', // Orange color for best streak
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 2,
  },
  streakSubtext: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  monthDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  currentMonth: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
  },
  pastMonth: {
    color: '#666666',
  },
  todayHint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 5,
  },
  dayContainer: {
    width: '13%',
    aspectRatio: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    marginHorizontal: '1%',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 4,
  },
  todayContainer: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  futureContainer: {
    backgroundColor: '#F9F9F9',
    opacity: 0.6,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '500',
    color: '#888888',
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
    textAlign: 'center',
  },
  todayText: {
    color: '#1976D2',
    fontWeight: 'bold',
  },
  futureText: {
    color: '#CCCCCC',
  },
  statusIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSymbol: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  futureIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  futureSymbol: {
    fontSize: 16,
    color: '#DDDDDD',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    minWidth: '45%',
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendSymbol: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  legendText: {
    fontSize: 12,
    color: '#666666',
  },
});

// Settings Modal Styles
const settingsStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    paddingTop: 20,
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666666',
  },
  settingsSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 12,
  },
  settingItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 8,
  },
  settingItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
  },
  settingItemSubtext: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  dangerText: {
    color: '#F44336',
  },
  editContainer: {
    marginTop: 8,
  },
  habitNameInput: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 12,
    textAlign: 'right',
  },
  editButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  editButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButtonText: {
    color: '#666666',
    fontWeight: '600',
    fontSize: 14,
  },
});
