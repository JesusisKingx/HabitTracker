import { Platform } from 'react-native';

let useUserStore;

if (Platform.OS === 'web') {
  // Simple store for web
  useUserStore = {
    isPremium: false,
    setPremium: () => {},
  };
} else {
  // Native store with persistence
  const { create } = require('zustand');
  const { persist } = require('zustand/middleware');
  const AsyncStorage =
    require('@react-native-async-storage/async-storage').default;

  useUserStore = create(
    persist(
      (set, get) => ({
        isPremium: false,
        setPremium: value => set({ isPremium: value }),
      }),
      {
        name: 'user-store',
        storage: {
          getItem: async name => {
            const value = await AsyncStorage.getItem(name);
            return value ?? null;
          },
          setItem: async (name, value) => {
            await AsyncStorage.setItem(name, value);
          },
          removeItem: async name => {
            await AsyncStorage.removeItem(name);
          },
        },
      }
    )
  );
}

export default useUserStore;
