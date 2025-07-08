// MY Habit tracker IOS App with real IAP
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Platform } from 'react-native';
import 'react-native-gesture-handler';

import { ITUNES_SHARED_SECRET } from '@env';
console.log(
  '🔐 IAP Shared Secret:',
  ITUNES_SHARED_SECRET ? 'Found' : 'Missing'
);

// Device detection utilities
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const DeviceInfo = {
  isTablet: () => {
    const aspectRatio = screenHeight / screenWidth;
    return screenWidth >= 768 || (aspectRatio < 1.6 && screenWidth >= 468);
  },

  isMacOS: () => {
    return (
      Platform.OS === 'macos' ||
      (Platform.OS === 'web' && navigator?.platform?.includes('Mac'))
    );
  },

  screenSize: {
    width: screenWidth,
    height: screenHeight,
    isLarge: screenWidth >= 768,
    isXLarge: screenWidth >= 1024,
  },
};

// Responsive sizing helpers
const responsive = {
  fontSize: size => {
    if (DeviceInfo.isTablet()) {
      return size * 1.2; // 20% larger on tablets
    }
    return size;
  },

  spacing: space => {
    if (DeviceInfo.isTablet()) {
      return space * 1.5; // 50% more spacing on tablets
    }
    return space;
  },
};

import {
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import ColorPickerModal from '../components/ColorPickerModal';
import ProgressGraph from '../components/ProgressGraph';
import Subscriptions from '../components/Subscriptions';

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
const THEME_KEY = '@HabitTracker:theme';

// In-App Purchase Product IDs
const PRODUCT_IDS = {
  MONTHLY: 'habittracker.premium.monthly.v2',
  YEARLY: 'habittracker.premium.yearly',
};

// Theme constants
const THEMES = {
  light: {
    background: '#F8F9FA',
    card: '#FFFFFF',
    text: '#333333',
    subtext: '#666666',
    border: '#E0E0E0',
    cardBg: '#F8F9FA',
    modalBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    buttonBg: '#F5F5F5',
  },
  dark: {
    background: '#000000', // Pure black background
    card: '#1C1C1E', // Space grey card
    text: '#FFFFFF',
    subtext: '#8E8E93', // iOS grey
    border: '#38383A', // Dark grey border
    cardBg: '#1C1C1E',
    modalBg: '#2C2C2E', // Slightly lighter modal
    inputBg: '#1C1C1E',
    buttonBg: '#2C2C2E',
  },
};

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
const EditHabitModal = ({
  visible,
  onClose,
  habit,
  onUpdateHabit,
  isPremium,
  onUpgradePremium,
}) => {
  const [habitName, setHabitName] = useState('');
  const [habitDescription, setHabitDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(HABIT_COLORS[0].value);
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Initialize form with current habit data
  useEffect(() => {
    if (habit) {
      setHabitName(habit.name);
      setHabitDescription(habit.description || '');
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
      description: habitDescription.trim(),
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
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
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

            <View style={addHabitStyles.inputSection}>
              <Text style={addHabitStyles.label}>Description (optional)</Text>
              <TextInput
                style={[addHabitStyles.input, addHabitStyles.descriptionInput]}
                value={habitDescription}
                onChangeText={setHabitDescription}
                placeholder="e.g., 30 minutes of cardio or strength training"
                maxLength={100}
                multiline={true}
                numberOfLines={2}
              />
              <Text style={addHabitStyles.charCount}>
                {habitDescription.length}/100 characters
              </Text>
            </View>

            <View style={addHabitStyles.colorSection}>
              <Text style={addHabitStyles.label}>Choose Color</Text>

              {/* Color Wheel Button - Always visible, locked for free users */}
              <TouchableOpacity
                style={[
                  addHabitStyles.colorPickerButton,
                  {
                    backgroundColor: isPremium ? selectedColor : '#E0E0E0',
                    borderWidth: isPremium ? 0 : 1,
                    borderColor: '#CCCCCC',
                    opacity: isPremium ? 1 : 0.7,
                  },
                ]}
                onPress={() => {
                  if (isPremium) {
                    setShowColorPicker(true);
                  } else {
                    Alert.alert(
                      'Premium Feature',
                      'Custom colors are available with Premium. Upgrade to unlock unlimited color choices!',
                      [
                        { text: 'Maybe Later', style: 'cancel' },
                        {
                          text: 'Upgrade to Premium',
                          onPress: () => {
                            onClose();
                            onUpgradePremium();
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <Text
                  style={[
                    addHabitStyles.colorPickerButtonText,
                    { color: isPremium ? '#FFFFFF' : '#999999' },
                  ]}
                >
                  {isPremium ? '🎨 Pick any Color' : '🔒 Pick any Color'}
                </Text>
              </TouchableOpacity>

              {/* Preset Colors - Always visible */}
              <Text
                style={[
                  addHabitStyles.label,
                  { marginTop: 16, marginBottom: 8 },
                ]}
              >
                Or choose a preset color:
              </Text>
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

              {/* Color Picker Modal - Only for premium users */}
              {isPremium && (
                <ColorPickerModal
                  visible={showColorPicker}
                  initialColor={selectedColor}
                  onClose={() => setShowColorPicker(false)}
                  onSelect={color => {
                    setSelectedColor(color);
                    setShowColorPicker(false);
                  }}
                />
              )}

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
  theme,
}) => {
  const [habitName, setHabitName] = useState('');
  const [habitDescription, setHabitDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(HABIT_COLORS[0].value);
  const [showColorPicker, setShowColorPicker] = useState(false);
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
      description: habitDescription.trim(),
      color: selectedColor,
      createdAt: new Date().toISOString(),
      trackingDays: selectedDays,
    });

    setHabitName('');
    setHabitDescription('');
    setSelectedColor(HABIT_COLORS[0].value);
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={addHabitStyles.modalOverlay}>
        <View style={addHabitStyles.modalContent}>
          <View style={addHabitStyles.modalHeader}>
            <Text style={[addHabitStyles.modalTitle, { color: theme.text }]}>
              Add New Habit
            </Text>
            <TouchableOpacity
              style={[
                addHabitStyles.closeButton,
                { backgroundColor: theme.buttonBg },
              ]}
              onPress={onClose}
            >
              <Text style={addHabitStyles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
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

            <View style={addHabitStyles.inputSection}>
              <Text style={addHabitStyles.label}>Description (optional)</Text>
              <TextInput
                style={[addHabitStyles.input, addHabitStyles.descriptionInput]}
                value={habitDescription}
                onChangeText={setHabitDescription}
                placeholder="e.g., 30 minutes of cardio or strength training"
                maxLength={100}
                multiline={true}
                numberOfLines={2}
                editable={canAddHabit}
              />
              <Text style={addHabitStyles.charCount}>
                {habitDescription.length}/100 characters
              </Text>
            </View>

            <View style={addHabitStyles.colorSection}>
              <Text style={addHabitStyles.label}>Choose Color</Text>

              {/* Color Wheel Button - Always visible, locked for free users */}
              <TouchableOpacity
                style={[
                  addHabitStyles.colorPickerButton,
                  {
                    backgroundColor: isPremium ? selectedColor : '#E0E0E0',
                    borderWidth: isPremium ? 0 : 1,
                    borderColor: '#CCCCCC',
                    opacity: isPremium ? 1 : 0.7,
                  },
                ]}
                onPress={() => {
                  if (isPremium) {
                    setShowColorPicker(true);
                  } else {
                    Alert.alert(
                      'Premium Feature',
                      'Custom colors are available with Premium. Upgrade to unlock unlimited color choices!',
                      [
                        { text: 'Maybe Later', style: 'cancel' },
                        {
                          text: 'Upgrade to Premium',
                          onPress: () => {
                            onClose();
                            onUpgradePremium();
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <Text
                  style={[
                    addHabitStyles.colorPickerButtonText,
                    { color: isPremium ? '#FFFFFF' : '#999999' },
                  ]}
                >
                  {isPremium ? '🎨 Pick any Color' : '🔒 Pick any Color'}
                </Text>
              </TouchableOpacity>

              {/* Preset Colors - Always visible */}
              <Text
                style={[
                  addHabitStyles.label,
                  { marginTop: 16, marginBottom: 8 },
                ]}
              >
                Or choose a preset color:
              </Text>
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

              {/* Color Picker Modal - Only for premium users */}
              {isPremium && (
                <ColorPickerModal
                  visible={showColorPicker}
                  initialColor={selectedColor}
                  onClose={() => setShowColorPicker(false)}
                  onSelect={color => {
                    setSelectedColor(color);
                    setShowColorPicker(false);
                  }}
                />
              )}

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
  theme,
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={habitSelectorStyles.scrollContainer}
        contentContainerStyle={habitSelectorStyles.scrollContent}
      >
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 8,
            minWidth: '100%',
          }}
        >
          {habits.map(habit => (
            <View key={habit.id} style={habitSelectorStyles.habitTabContainer}>
              <TouchableOpacity
                style={[
                  habitSelectorStyles.habitTab,
                  selectedHabitId === habit.id && [
                    habitSelectorStyles.selectedTab,
                    { backgroundColor: theme.buttonBg },
                  ],
                  {
                    borderBottomColor:
                      selectedHabitId === habit.id
                        ? habit.color
                        : 'transparent',
                  },
                ]}
                onPress={() => {
                  onSelectHabit(habit.id);
                  setLongPressedHabitId(null);
                }}
                onLongPress={() => setLongPressedHabitId(habit.id)}
                delayLongPress={500}
              >
                <View
                  style={[
                    habitSelectorStyles.colorDot,
                    {
                      backgroundColor: habit.color,
                      opacity: selectedHabitId === habit.id ? 1 : 0.4,
                    },
                  ]}
                />
                <View>
                  <Text
                    style={[
                      habitSelectorStyles.tabText,
                      {
                        color:
                          selectedHabitId === habit.id
                            ? theme === THEMES.dark
                              ? '#FFFFFF'
                              : '#333333'
                            : theme.subtext,
                        width: 80,
                        overflow: 'hidden',
                        textAlign: 'center',
                      },
                      selectedHabitId === habit.id &&
                        habitSelectorStyles.selectedTabText,
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    adjustsFontSizeToFit={false}
                  >
                    {habit.name}
                  </Text>

                  {habit.description ? (
                    <Text
                      style={{
                        fontSize: 11,
                        color:
                          selectedHabitId === habit.id
                            ? theme === THEMES.dark
                              ? '#E0E0E0'
                              : '#666666'
                            : '#999',
                        marginTop: 2,
                        width: 90,
                        overflow: 'hidden',
                      }}
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit={false}
                    >
                      {habit.description}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={habitSelectorStyles.addTabButton}
            onPress={onAddHabit}
          >
            <Text style={habitSelectorStyles.addTabButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
              selectedHabitId === habit.id && [
                habitSelectorStyles.selectedTab,
                { backgroundColor: theme.buttonBg },
              ],
              {
                borderBottomColor:
                  selectedHabitId === habit.id ? habit.color : 'transparent',
              },
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
                {
                  backgroundColor: habit.color,
                  opacity: selectedHabitId === habit.id ? 1 : 0.4, // Dim inactive dots
                },
              ]}
            />
            <View>
              <Text
                style={[
                  habitSelectorStyles.tabText,
                  {
                    color:
                      selectedHabitId === habit.id
                        ? theme.background === '#000000'
                          ? '#FFFFFF'
                          : '#333333'
                        : theme.subtext,
                    width: 80,
                    overflow: 'hidden',
                    textAlign: 'center',
                  },
                  selectedHabitId === habit.id &&
                    habitSelectorStyles.selectedTabText,
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit={false}
              >
                {habit.name}
              </Text>

              {habit.description ? (
                <Text
                  style={{
                    fontSize: 11,
                    color:
                      selectedHabitId === habit.id
                        ? theme === THEMES.dark
                          ? '#E0E0E0'
                          : '#666666'
                        : '#999',
                    marginTop: 2,
                    width: 90,
                    overflow: 'hidden',
                  }}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit={false}
                >
                  {habit.description}
                </Text>
              ) : null}
            </View>
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
  isPremium,
  theme,
  onThemeChange,
  setShowProgressGraph,
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
        <View
          style={[
            settingsStyles.modalContent,
            { backgroundColor: theme === 'dark' ? '#1C1C1E' : '#FFFFFF' },
          ]}
        >
          <View style={settingsStyles.modalHeader}>
            <Text
              style={[
                settingsStyles.modalTitle,
                { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
              ]}
            >
              Settings
            </Text>
            <TouchableOpacity
              style={[
                settingsStyles.closeButton,
                { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F5F5F5' },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  settingsStyles.closeButtonText,
                  { color: theme === 'dark' ? '#FFFFFF' : '#666666' },
                ]}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ paddingBottom: 20 }}
          >
            <View style={settingsStyles.settingsSection}>
              <Text
                style={[
                  settingsStyles.sectionTitle,
                  { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                ]}
              >
                Current Habit
              </Text>
              {isEditingName ? (
                <View style={settingsStyles.editContainer}>
                  <TextInput
                    style={[
                      settingsStyles.habitNameInput,
                      {
                        backgroundColor:
                          theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
                        borderColor: theme === 'dark' ? '#38383A' : '#4CAF50',
                        color: theme === 'dark' ? '#FFFFFF' : '#333333',
                      },
                    ]}
                    value={tempHabitName}
                    onChangeText={setTempHabitName}
                    placeholder="Enter habit name"
                    placeholderTextColor={
                      theme === 'dark' ? '#8E8E93' : '#999999'
                    }
                    maxLength={30}
                    autoFocus={true}
                    onSubmitEditing={saveHabitName}
                    returnKeyType="done"
                  />
                  <Text
                    style={[
                      settingsStyles.charCount,
                      { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                    ]}
                  >
                    {tempHabitName.length}/30 characters
                  </Text>
                  <View style={settingsStyles.editButtonsContainer}>
                    <TouchableOpacity
                      style={[
                        settingsStyles.editButton,
                        settingsStyles.cancelButton,
                      ]}
                      onPress={() => {
                        onDeleteHabit?.(selectedHabit?.id);
                        onClose();
                      }}
                    >
                      <Text style={settingsStyles.cancelButtonText}>
                        Delete Habit
                      </Text>
                    </TouchableOpacity>
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
                  style={[
                    settingsStyles.settingItem,
                    {
                      backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA',
                    },
                  ]}
                  onPress={() => setIsEditingName(true)}
                >
                  <Text
                    style={[
                      settingsStyles.settingItemText,
                      { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                    ]}
                  >
                    {habitName}
                  </Text>
                  <Text
                    style={[
                      settingsStyles.settingItemSubtext,
                      { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                    ]}
                  >
                    Tap to edit
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text
                style={[
                  settingsStyles.sectionTitle,
                  { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                ]}
              >
                Statistics
              </Text>
              <View
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Days Conquered:{' '}
                  {(() => {
                    const habitDays = habitData[selectedHabit?.id] || {};
                    return Object.values(habitDays).filter(
                      status => status === 'completed'
                    ).length;
                  })()}
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Total completed days for this habit
                </Text>
              </View>
              <View
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Personal Best:{' '}
                  {(() => {
                    if (!selectedHabit?.id || !habitData[selectedHabit.id])
                      return 'Get started!';

                    const trackingDays = selectedHabit.trackingDays || [
                      0, 1, 2, 3, 4, 5, 6,
                    ];
                    const completedDates = Object.keys(
                      habitData[selectedHabit.id]
                    )
                      .filter(
                        date =>
                          habitData[selectedHabit.id][date] === 'completed'
                      )
                      .sort();

                    if (completedDates.length === 0) return 'Get started!';

                    let longestStreak = 0;
                    let currentStreak = 0;
                    let lastCompletedTrackingDate = null;

                    for (let i = 0; i < completedDates.length; i++) {
                      const currentDate = new Date(
                        completedDates[i] + 'T00:00:00'
                      );
                      const currentDayOfWeek = currentDate.getDay();

                      if (!trackingDays.includes(currentDayOfWeek)) continue;

                      if (lastCompletedTrackingDate === null) {
                        currentStreak = 1;
                      } else {
                        let expectedDate = new Date(lastCompletedTrackingDate);
                        let foundNextTrackingDay = false;

                        for (let j = 0; j < 7; j++) {
                          expectedDate.setDate(expectedDate.getDate() + 1);
                          const expectedDayOfWeek = expectedDate.getDay();

                          if (trackingDays.includes(expectedDayOfWeek)) {
                            const expectedDateString = expectedDate
                              .toISOString()
                              .split('T')[0];
                            if (expectedDateString === completedDates[i]) {
                              currentStreak++;
                              foundNextTrackingDay = true;
                            } else {
                              currentStreak = 1;
                            }
                            break;
                          }
                        }

                        if (!foundNextTrackingDay) {
                          currentStreak = 1;
                        }
                      }

                      longestStreak = Math.max(longestStreak, currentStreak);
                      lastCompletedTrackingDate = currentDate;
                    }

                    if (longestStreak === 0) return 'Get started!';
                    if (longestStreak === 1) return '1 day!';
                    return `${longestStreak} days straight!`;
                  })()}
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Your longest consecutive streak
                </Text>
              </View>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Appearance</Text>
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={() =>
                  onThemeChange(theme === 'light' ? 'dark' : 'light')
                }
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Theme: {theme === 'light' ? 'Light' : 'Dark'}
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Tap to switch to {theme === 'light' ? 'dark' : 'light'} mode
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Premium</Text>
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={() => {
                  onClose(); // Close settings first
                  onUpgradePremium();
                }}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Upgrade to Premium
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Unlimited habits, themes, and more
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={onRestorePurchases}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Restore Purchases
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Already purchased? Restore your subscription
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Data</Text>
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={() => {
                  if (isPremium) {
                    onClose(); // close SettingsModal
                    setTimeout(() => setShowProgressGraph(true), 250); // open graph after close
                  } else {
                    Alert.alert(
                      'Premium Feature',
                      'Progress graphs are available with Premium. Track your consistency trends and see detailed analytics!',
                      [
                        { text: 'Maybe Later', style: 'cancel' },
                        {
                          text: 'Upgrade to Premium',
                          onPress: () => {
                            onClose(); // Close settings modal
                            onUpgradePremium(); // Open premium upgrade
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  📊 Progress Graph
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  {isPremium
                    ? 'View completion trends over time'
                    : '🔒 Premium - View trends'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
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
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Remove all checkmarks from current month
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
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
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Remove all checkmarks from this habit
                </Text>
              </TouchableOpacity>
              {habitsList.length > 1 && (
                <TouchableOpacity
                  style={[
                    settingsStyles.settingItem,
                    {
                      backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA',
                    },
                  ]}
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
                      { color: '#F44336' }, // Keep red color for danger items
                    ]}
                  >
                    Clear All Habits
                  </Text>
                  <Text
                    style={[
                      settingsStyles.settingItemSubtext,
                      { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                    ]}
                  >
                    Remove all checkmarks from all habits
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Notifications</Text>
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
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
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Daily Reminders
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Get reminded to complete your habits
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={async () => {
                  await Notifications.cancelAllScheduledNotificationsAsync();
                  Alert.alert(
                    'Success',
                    'Daily reminders have been turned off.'
                  );
                }}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Turn Off Reminders
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Stop receiving daily notifications
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Data Export</Text>

              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={exportUserData}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Export My Data
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Download all your habit data
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Support</Text>

              {/* Terms of Use */}
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={() =>
                  Linking.openURL('https://ktforge.dev/habittracker-eula.html')
                }
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Terms of Use
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  View our license agreement
                </Text>
              </TouchableOpacity>

              {/* Privacy Policy */}
              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={() =>
                  Linking.openURL(
                    'https://ktforge.dev/habittracker-privacy.html'
                  )
                }
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Privacy Policy
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  View our privacy policy
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
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
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Contact Support
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Get help with the app
                </Text>
              </TouchableOpacity>
            </View>

            <View style={settingsStyles.settingsSection}>
              <Text style={settingsStyles.sectionTitle}>Community</Text>

              <TouchableOpacity
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
                onPress={async () => {
                  try {
                    const url = 'https://www.facebook.com/HabitTrackerPro';
                    const supported = await Linking.canOpenURL(url);
                    if (supported) {
                      await Linking.openURL(url);
                    } else {
                      Alert.alert('Error', 'Could not open community page');
                    }
                  } catch (error) {
                    Alert.alert('Error', 'Could not open community page');
                  }
                }}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Join Our Community
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  Connect with other habit builders and get motivation
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={[settingsStyles.settingsSection, { marginBottom: 40 }]}
            >
              <Text style={settingsStyles.sectionTitle}>About</Text>
              <View
                style={[
                  settingsStyles.settingItem,
                  { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
                ]}
              >
                <Text
                  style={[
                    settingsStyles.settingItemText,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  HabitTracker
                </Text>
                <Text
                  style={[
                    settingsStyles.settingItemSubtext,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
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
  theme,
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

    const selectedDays = selectedHabit.trackingDays || [0, 1, 2, 3, 4, 5, 6];

    const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    let totalTrackingDays = 0;
    let completedDays = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const dateString = getLocalDateString(date);
      const isFuture = date > today && isCurrentMonth;

      if (isFuture) continue;

      const dayOfWeek = date.getDay();
      if (!selectedDays.includes(dayOfWeek)) continue;

      totalTrackingDays++;

      if (habitData[dateString] === 'completed') {
        completedDays++;
      }
    }

    const percentage =
      totalTrackingDays > 0
        ? Math.round((completedDays / totalTrackingDays) * 100)
        : 0;

    return {
      completedDays,
      totalDays: totalTrackingDays,
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
    <View style={[calendarStyles.container, { backgroundColor: theme.card }]}>
      {/* Monthly Progress Stats - Premium Feature */}
      {isPremium ? (
        <View
          style={[
            calendarStyles.progressSection,
            {
              backgroundColor: theme.buttonBg,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[calendarStyles.progressTitle, { color: theme.text }]}>
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
            <View
              style={[
                calendarStyles.progressBarBackground,
                {
                  backgroundColor: theme.background,
                },
              ]}
            >
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
          <Text
            style={[calendarStyles.progressSubtext, { color: theme.subtext }]}
          >
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
      <View
        style={[
          calendarStyles.motivationSection,
          {
            backgroundColor: theme.buttonBg,
            borderColor: theme.border,
          },
        ]}
      >
        <Text style={[calendarStyles.motivationQuote, { color: theme.text }]}>
          {getStreakQuote(currentStreak, selectedHabit?.trackingDays)}
        </Text>
      </View>

      {/* Streak Display */}
      <View style={calendarStyles.streakContainer}>
        <View
          style={[
            calendarStyles.streakCard,
            {
              backgroundColor: theme.buttonBg,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={calendarStyles.streakNumber}>{currentStreak}</Text>
          <Text style={[calendarStyles.streakLabel, { color: theme.text }]}>
            Current Streak
          </Text>
          <Text
            style={[calendarStyles.streakSubtext, { color: theme.subtext }]}
          >
            {currentStreak === 0
              ? 'Start today!'
              : currentStreak === 1
                ? 'day'
                : 'days in a row'}
          </Text>
        </View>

        <View
          style={[
            calendarStyles.streakCard,
            {
              backgroundColor: theme.buttonBg,
              borderColor: theme.border,
            },
          ]}
        >
          <Text
            style={[
              calendarStyles.streakNumber,
              calendarStyles.bestStreakNumber,
            ]}
          >
            {longestStreak}
          </Text>
          <Text style={[calendarStyles.streakLabel, { color: theme.text }]}>
            Best Streak
          </Text>
          <Text
            style={[calendarStyles.streakSubtext, { color: theme.subtext }]}
          >
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
          style={[
            calendarStyles.navButton,
            { backgroundColor: theme.buttonBg },
          ]}
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
              { color: theme.text },
              !isCurrentMonth && calendarStyles.pastMonth,
            ]}
          >
            {currentMonth}
          </Text>
          {!isCurrentMonth && (
            <Text style={[calendarStyles.todayHint, { color: theme.subtext }]}>
              Tap to go to current month
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            calendarStyles.navButton,
            { backgroundColor: theme.buttonBg },
          ]}
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
                { backgroundColor: theme.buttonBg },
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
                  { color: theme.subtext },
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
                  { color: theme.text },
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
          <Text style={[calendarStyles.legendText, { color: theme.subtext }]}>
            Completed
          </Text>
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
          <Text style={[calendarStyles.legendText, { color: theme.subtext }]}>
            Not marked
          </Text>
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
          <Text style={[calendarStyles.legendText, { color: theme.subtext }]}>
            Future
          </Text>
        </View>
      </View>
    </View>
  );
};

// Main component
export default function HomeScreen() {
  const scrollRef = useRef(null);
  // Initialize with empty data - we'll load from storage
  const [habitData, setHabitData] = useState({}); // { habitId: { date: status } }
  const [habitsList, setHabitsList] = useState([
    { id: '1', name: 'Gym', description: 'Workout for 30 min' },
    { id: '2', name: 'Read', description: 'Read 10 pages' },
    { id: '3', name: 'Meditate', description: '10 minutes mindfulness' },
  ]);
  // Array of habit objects
  const [selectedHabitId, setSelectedHabitId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [showEditHabit, setShowEditHabit] = useState(false);
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showProgressGraph, setShowProgressGraph] = useState(false);
  const [isPremium, setIsPremium] = useState(false); // Start as false, load from storage
  const [theme, setTheme] = useState('light'); // Theme state

  const statusBarStyle = theme === 'dark' ? 'light' : 'dark';

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
      console.log(
        'Habit data saved successfully:',
        Object.keys(data).length,
        'habits'
      );
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

  // Debug function to check storage
  const debugCheckStorage = async () => {
    try {
      const [habitDataJson, habitsListJson] = await Promise.all([
        AsyncStorage.getItem(HABIT_DATA_KEY),
        AsyncStorage.getItem(HABITS_LIST_KEY),
      ]);

      const habitData = habitDataJson ? JSON.parse(habitDataJson) : {};
      const habitsList = habitsListJson ? JSON.parse(habitsListJson) : [];

      console.log('=== STORAGE DEBUG ===');
      console.log('Habits in list:', habitsList.length);
      console.log(
        'Habit IDs in list:',
        habitsList.map(h => h.id)
      );
      console.log('Habits in data:', Object.keys(habitData).length);
      console.log('Habit IDs in data:', Object.keys(habitData));
      console.log('===================');

      // Check for orphaned data
      const orphanedIds = Object.keys(habitData).filter(
        id => !habitsList.find(h => h.id === id)
      );
      if (orphanedIds.length > 0) {
        console.log('⚠️ ORPHANED HABIT DATA FOUND:', orphanedIds);
      }
    } catch (error) {
      console.error('Debug check error:', error);
    }
  };

  // Load all data from AsyncStorage
  const loadAllData = async () => {
    try {
      // Load all data in parallel
      const [
        habitDataJson,
        habitsListJson,
        selectedHabitId,
        premiumStatus,
        savedTheme,
      ] = await Promise.all([
        AsyncStorage.getItem(HABIT_DATA_KEY),
        AsyncStorage.getItem(HABITS_LIST_KEY),
        AsyncStorage.getItem(SELECTED_HABIT_KEY),
        AsyncStorage.getItem(PREMIUM_STATUS_KEY),
        AsyncStorage.getItem(THEME_KEY),
      ]);

      const parsedHabitData = habitDataJson ? JSON.parse(habitDataJson) : {};
      const parsedHabitsList = habitsListJson ? JSON.parse(habitsListJson) : [];

      // 🔥 Automatically delete orphaned habits (data with no habit in list)
      const validHabitIds = parsedHabitsList.map(h => h.id);
      const cleanedHabitData = Object.fromEntries(
        Object.entries(parsedHabitData).filter(([id]) =>
          validHabitIds.includes(id)
        )
      );

      setHabitData(cleanedHabitData);
      setHabitsList(parsedHabitsList);

      // Set premium status
      if (premiumStatus === 'true') {
        setIsPremium(true);
      }

      // Set theme
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
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

      // Debug check storage
      await debugCheckStorage();
    } catch (error) {
      console.error('Error loading data:', error);
      createFirstHabit();
    } finally {
      setIsLoading(false);
    }
  };

  // Simple restore purchases
  const restorePurchases = async () => {
    try {
      // Just re-check AsyncStorage and show message
      const premiumStatus = await AsyncStorage.getItem(PREMIUM_STATUS_KEY);
      if (premiumStatus === 'true') {
        setIsPremium(true);
        Alert.alert('Success', 'Your premium subscription has been restored!');
      } else {
        Alert.alert('No Purchases Found', 'No previous purchases were found.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
    }
  };

  // Simplified IAP check - just check if user already has premium
  const checkExistingPurchases = async () => {
    try {
      // Check AsyncStorage for existing premium status
      const premiumStatus = await AsyncStorage.getItem(PREMIUM_STATUS_KEY);
      if (premiumStatus === 'true') {
        console.log('✅ [IAP] Premium status found in storage');
        setIsPremium(true);
      }
    } catch (error) {
      console.log('❌ [IAP] Error checking existing purchases:', error);
    }
  };

  // Simplified success handler - just check premium status
  const handleSubscriptionSuccess = async () => {
    console.log('✅ [IAP] Subscription successful, enabling premium');
    setIsPremium(true);
    await savePremiumStatus(true);
    setShowSubscriptions(false);
  };

  // Create first habit for new users
  const createFirstHabit = () => {
    const firstHabit = {
      id: Date.now().toString(),
      name: 'My Habit',
      description: '', // Add description field
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

  // Check existing purchases when component mounts
  useEffect(() => {
    checkExistingPurchases();
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

  // Save all data when app goes to background
  useEffect(() => {
    const handleAppStateChange = nextAppState => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Save all data when app goes to background
        if (!isLoading) {
          saveHabitData(habitData);
          saveHabitsList(habitsList);
          if (selectedHabitId) saveSelectedHabit(selectedHabitId);
          savePremiumStatus(isPremium);
          AsyncStorage.setItem(THEME_KEY, theme);
          console.log('All data saved on app background');
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      subscription?.remove();
    };
  }, [habitData, habitsList, selectedHabitId, isPremium, theme, isLoading]);

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
          onPress: async () => {
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

            // Force save to ensure cleanup
            await saveHabitData(updatedData);
            await saveHabitsList(updatedHabits);

            console.log('Habit deleted successfully:', habitId);
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
      let exportText = 'Exported Habit Data\n\n';

      for (const habit of habitsList) {
        const { id, name, color, description, createdDate } = habit;
        const habitDataForExport = habitData[id] || {};

        const dates = Object.keys(habitDataForExport).filter(
          date => habitDataForExport[date] === 'completed'
        );

        const formattedDates = dates
          .sort((a, b) => new Date(b) - new Date(a))
          .map(date =>
            new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          )
          .join(', ');

        // Calculate % completed
        const today = new Date();
        const viewMonth = today.getMonth();
        const viewYear = today.getFullYear();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        const completedThisMonth = dates.filter(d => {
          const date = new Date(d + 'T00:00:00');
          return (
            date.getMonth() === viewMonth && date.getFullYear() === viewYear
          );
        }).length;

        const percentage =
          daysInMonth > 0
            ? Math.round((completedThisMonth / daysInMonth) * 100)
            : 0;

        exportText += `Habit: ${name}\n`;
        exportText += `  Description: ${description || 'None'}\n`;
        exportText += `  Color: ${color}\n`;
        exportText += `  Created: ${
          createdDate
            ? new Date(createdDate).toLocaleDateString('en-US')
            : 'N/A'
        }\n`;
        exportText += `  Completion: ${percentage}% this month\n`;
        exportText += `  Days Tracked: ${dates.length}\n`;
        exportText += `  Dates: ${formattedDates || 'None'}\n\n`;
      }

      exportText += `Premium: ${isPremium ? 'Yes' : 'No'}\n`;
      exportText += `Exported: ${new Date().toLocaleString()}`;

      const exportPath = `${FileSystem.documentDirectory}habit_export.txt`;
      await FileSystem.writeAsStringAsync(exportPath, exportText);
      await Sharing.shareAsync(exportPath, {
        mimeType: 'text/plain',
        dialogTitle: 'Export Habit Data',
      });
    } catch (error) {
      Alert.alert('Export Failed', 'Unable to export your data.');
      console.error('Export error:', error);
    }
  };

  const handleUpgradePremium = () => {
    setShowSubscriptions(true);
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

  const currentTheme = THEMES[theme];

  // Tablet layout renderer
  const renderTabletLayout = () => (
    <View style={styles.tabletContainer}>
      {/* Left Panel - Habits List */}
      <View
        style={[styles.tabletSidebar, { backgroundColor: currentTheme.card }]}
      >
        <Text style={[styles.sidebarTitle, { color: currentTheme.text }]}>
          My Habits
        </Text>
        <ScrollView style={styles.habitsList}>
          {habitsList.map(habit => (
            <TouchableOpacity
              key={habit.id}
              style={[
                styles.habitListItem,
                selectedHabitId === habit.id && styles.habitListItemSelected,
                {
                  borderColor:
                    selectedHabitId === habit.id ? habit.color : 'transparent',
                },
              ]}
              onPress={() => setSelectedHabitId(habit.id)}
            >
              <View
                style={[
                  styles.habitColorIndicator,
                  { backgroundColor: habit.color },
                ]}
              />
              <View style={styles.habitListInfo}>
                <Text
                  style={[styles.habitListName, { color: currentTheme.text }]}
                >
                  {habit.name}
                </Text>
                {habit.description ? (
                  <Text
                    style={[
                      styles.habitListDescription,
                      { color: currentTheme.subtext },
                    ]}
                  >
                    {habit.description}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addHabitButton}
            onPress={() => setShowAddHabit(true)}
          >
            <Text style={styles.addHabitButtonText}>+ Add New Habit</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Right Panel - Calendar */}
      <ScrollView
        ref={scrollRef}
        style={styles.tabletMainContent}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* Add the button row above the calendar */}
        {selectedHabit && (
          <>
            <View
              style={[
                styles.habitSelectorContainer,
                { backgroundColor: currentTheme.card },
              ]}
            >
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setShowEditHabit(true)}
                >
                  <Text style={styles.editIcon}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => {
                    Alert.alert(
                      'Delete Habit',
                      'Are you sure you want to delete this habit?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            const selectedHabitId = selectedHabit?.id;
                            if (selectedHabitId) {
                              const updatedHabits = habitsList.filter(
                                h => h.id !== selectedHabitId
                              );
                              setHabitsList(updatedHabits);
                              setSelectedHabitId(updatedHabits[0]?.id ?? null);
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.editIcon}>🗑️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={() => setShowSettings(true)}
                >
                  <Text style={styles.settingsIcon}>⚙️</Text>
                </TouchableOpacity>
              </View>
            </View>

            <CalendarGrid
              habitData={currentHabitData}
              selectedHabit={selectedHabit}
              onDayPress={handleDayPress}
              onSettingsPress={() => setShowSettings(true)}
              onTodayPress={handleTodayPress}
              isPremium={isPremium}
              theme={currentTheme}
            />
          </>
        )}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: currentTheme.background }]}
    >
      <StatusBar style={statusBarStyle} />

      {DeviceInfo.isTablet() ? (
        renderTabletLayout()
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Habit Selector */}
          <View
            style={[
              styles.habitSelectorContainer,
              { backgroundColor: currentTheme.card },
            ]}
          >
            <HabitSelector
              habits={habitsList}
              selectedHabitId={selectedHabitId}
              onSelectHabit={handleSelectHabit}
              onAddHabit={() => setShowAddHabit(true)}
              onDeleteHabit={handleDeleteHabit}
              theme={currentTheme}
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
                  style={styles.editButton}
                  onPress={() => {
                    Alert.alert(
                      'Delete Habit',
                      'Are you sure you want to delete this habit?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            const selectedHabitId = selectedHabit?.id;
                            if (selectedHabitId) {
                              const updatedHabits = habitsList.filter(
                                h => h.id !== selectedHabitId
                              );
                              setHabitsList(updatedHabits);
                              setSelectedHabitId(updatedHabits[0]?.id ?? null);
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.editIcon}>🗑️</Text>
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
              theme={currentTheme}
            />
          )}
        </ScrollView>
      )}

      {/* Scroll-to-top Home button */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }}
      >
        <Text style={styles.homeButtonText}>🏠</Text>
      </TouchableOpacity>

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
        isPremium={isPremium}
        theme={theme}
        onThemeChange={newTheme => {
          setTheme(newTheme);
          AsyncStorage.setItem(THEME_KEY, newTheme);
        }}
        setShowProgressGraph={setShowProgressGraph}
      />

      <AddHabitModal
        visible={showAddHabit}
        onClose={() => setShowAddHabit(false)}
        onAddHabit={handleAddHabit}
        habitCount={habitsList.length}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
        theme={currentTheme}
      />
      <EditHabitModal
        visible={showEditHabit}
        onClose={() => setShowEditHabit(false)}
        habit={selectedHabit}
        onUpdateHabit={handleUpdateHabit}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
      />

      <Modal
        visible={showSubscriptions}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowSubscriptions(false)}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <Subscriptions
          visible={showSubscriptions}
          onClose={() => setShowSubscriptions(false)}
          onSuccess={() => {
            setIsPremium(true);
            setShowSubscriptions(false);
          }}
          restorePurchases={restorePurchases}
          theme={theme}
        />
      </Modal>

      <ProgressGraph
        visible={showProgressGraph}
        onClose={() => setShowProgressGraph(false)}
        habitData={habitData}
        selectedHabit={selectedHabit}
        theme={theme}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
      />

      {/* Scroll-to-top Home button */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }}
      >
        <Text style={styles.homeButtonText}>🏠</Text>
      </TouchableOpacity>

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
        isPremium={isPremium}
        theme={theme}
        onThemeChange={newTheme => {
          setTheme(newTheme);
          AsyncStorage.setItem(THEME_KEY, newTheme);
        }}
        setShowProgressGraph={setShowProgressGraph}
      />

      <AddHabitModal
        visible={showAddHabit}
        onClose={() => setShowAddHabit(false)}
        onAddHabit={handleAddHabit}
        habitCount={habitsList.length}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
        theme={currentTheme}
      />
      <EditHabitModal
        visible={showEditHabit}
        onClose={() => setShowEditHabit(false)}
        habit={selectedHabit}
        onUpdateHabit={handleUpdateHabit}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
      />

      <Modal
        visible={showSubscriptions}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowSubscriptions(false)}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <Subscriptions
          visible={showSubscriptions}
          onClose={() => setShowSubscriptions(false)}
          onSuccess={() => {
            setIsPremium(true);
            setShowSubscriptions(false);
          }}
          restorePurchases={restorePurchases}
          theme={theme}
        />
      </Modal>

      <ProgressGraph
        visible={showProgressGraph}
        onClose={() => setShowProgressGraph(false)}
        habitData={habitData}
        selectedHabit={selectedHabit}
        theme={theme}
        isPremium={isPremium}
        onUpgradePremium={handleUpgradePremium}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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

  // Tablet-specific styles
  tabletContainer: {
    flex: 1,
    flexDirection: 'row',
  },

  tabletSidebar: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    paddingTop: 20,
  },

  sidebarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  habitsList: {
    flex: 1,
  },

  habitListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },

  habitListItemSelected: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },

  habitColorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },

  habitListInfo: {
    flex: 1,
  },

  habitListName: {
    fontSize: 16,
    fontWeight: '600',
  },

  habitListDescription: {
    fontSize: 13,
    marginTop: 2,
  },

  addHabitButton: {
    margin: 20,
    padding: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    alignItems: 'center',
  },

  addHabitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  tabletMainContent: {
    flex: 1,
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
  homeButton: {
    position: 'absolute',
    bottom: DeviceInfo.isTablet() || Platform.OS === 'web' ? 10 : 60,

    left:
      DeviceInfo.isTablet() || Platform.OS === 'web'
        ? 320 + (DeviceInfo.screenSize.width - 320) / 2
        : '50%',
    transform: [
      {
        translateX: DeviceInfo.isTablet() || Platform.OS === 'web' ? -32 : -28,
      },
    ],
    width: DeviceInfo.isTablet() || Platform.OS === 'web' ? 64 : 56,
    height: DeviceInfo.isTablet() || Platform.OS === 'web' ? 64 : 56,
    borderRadius: DeviceInfo.isTablet() || Platform.OS === 'web' ? 32 : 28,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },

  homeButtonText: {
    fontSize: DeviceInfo.isTablet() ? 28 : 24,
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
    borderBottomWidth: 3, // Thicker border for selected
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666', // greyed out for unselected
    marginLeft: 4,
  },
  selectedTabText: {
    color: '#333333', // dark text for selected
    fontWeight: '700',
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
  colorPickerButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  colorPickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: DeviceInfo.isTablet() ? 600 : '90%',
    maxWidth: DeviceInfo.isTablet() ? 600 : undefined,
    maxHeight: DeviceInfo.isTablet() ? '70%' : '85%',
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
    justifyContent: 'flex-start',
    marginHorizontal: -2,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    margin: 5,
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
  descriptionInput: {
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: 'bold',
  },
});

// Calendar component styles
const calendarStyles = StyleSheet.create({
  container: {
    padding: DeviceInfo.isTablet() ? 40 : 20,
    maxWidth: DeviceInfo.isTablet() ? 800 : '100%',
    alignSelf: 'center',
    width: '100%',
  },
  progressSection: {
    marginBottom: DeviceInfo.isTablet() ? 30 : 20,
    paddingHorizontal: DeviceInfo.isTablet() ? 30 : 20,
    paddingVertical: DeviceInfo.isTablet() ? 24 : 16,
    backgroundColor: '#F8F9FA',
    borderRadius: DeviceInfo.isTablet() ? 16 : 12,
    marginHorizontal: DeviceInfo.isTablet() ? 20 : 10,
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
    marginBottom: DeviceInfo.isTablet() ? 30 : 20,
    paddingHorizontal: DeviceInfo.isTablet() ? 20 : 10,
  },
  todayButton: {
    paddingVertical: DeviceInfo.isTablet() ? 20 : 16,
    paddingHorizontal: DeviceInfo.isTablet() ? 32 : 24,
    borderRadius: DeviceInfo.isTablet() ? 16 : 12,
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
    borderRadius: DeviceInfo.isTablet() ? 16 : 12,
    padding: DeviceInfo.isTablet() ? 24 : 15,
    marginHorizontal: DeviceInfo.isTablet() ? 10 : 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: DeviceInfo.isTablet() ? 140 : undefined,
  },
  streakNumber: {
    fontSize: DeviceInfo.isTablet() ? 42 : 32,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: DeviceInfo.isTablet() ? 8 : 5,
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
  calendarContainer: {
    alignItems: 'center',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start', // ensures wrapping starts at left
    alignSelf: 'center', // centers the whole grid horizontally
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },

  dayContainer: {
    width: DeviceInfo.isTablet() ? '13%' : '14.2857%', // Slightly smaller % on iPad for margins
    aspectRatio: DeviceInfo.isTablet() ? 1 : 0.85, // Square on iPad
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DeviceInfo.isTablet() ? 15 : 10,
    marginHorizontal: DeviceInfo.isTablet() ? '0.5%' : 0, // Add horizontal margins on iPad
    backgroundColor: '#F5F5F5',
    borderRadius: DeviceInfo.isTablet() ? 12 : 8,
    padding: DeviceInfo.isTablet() ? 8 : 4,
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
    textAlign: 'center',
    lineHeight: 12,
  },
  dayNumber: {
    fontSize: 9,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
    marginBottom: 4,
    marginTop: 2,
    lineHeight: 12,
  },
  todayText: {
    color: '#1976D2',
    fontWeight: 'bold',
  },
  futureText: {
    color: '#CCCCCC',
  },
  statusIndicator: {
    width: DeviceInfo.isTablet() ? 24 : 18,
    height: DeviceInfo.isTablet() ? 24 : 18,
    borderRadius: DeviceInfo.isTablet() ? 12 : 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  statusSymbol: {
    fontSize: DeviceInfo.isTablet() ? 16 : 12,
    fontWeight: 'bold',
    lineHeight: DeviceInfo.isTablet() ? 16 : 12,
    textAlign: 'center',
    textAlignVertical: 'center',
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
    justifyContent: 'center', // Center the legend as a whole
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 30,
    paddingTop: 20,
    paddingBottom: 60,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 10,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // horizontal space between dot and label
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
    borderRadius: 12,
    width: DeviceInfo.isTablet() ? 600 : '90%',
    maxWidth: DeviceInfo.isTablet() ? 600 : undefined,
    maxHeight: DeviceInfo.isTablet() ? '70%' : '80%',
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
