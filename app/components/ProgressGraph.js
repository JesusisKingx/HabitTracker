// Enhanced ProgressGraph.js with Professional Polish and Fixed Export

import {
  eachMonthOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { captureRef } from 'react-native-view-shot';

const { width: screenWidth } = Dimensions.get('window');

export default function ProgressGraph({
  visible,
  onClose,
  habitData,
  selectedHabit,
  theme,
  isPremium,
  onUpgradePremium,
}) {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6months');
  const [exporting, setExporting] = useState(false);

  // Ref for capturing the graph
  const graphRef = useRef(null);

  useEffect(() => {
    if (visible && selectedHabit && habitData[selectedHabit.id]) {
      processHabitData();
    }
  }, [visible, selectedHabit, timeRange, habitData]);

  const processHabitData = () => {
    setLoading(true);
    const completions = habitData[selectedHabit.id] || {};
    const today = new Date();
    let startDate;

    switch (timeRange) {
      case '3months':
        startDate = subMonths(today, 3);
        break;
      case '1year':
        startDate = subMonths(today, 12);
        break;
      case 'all':
        const dates = Object.keys(completions).sort();
        startDate = dates.length ? parseISO(dates[0]) : subMonths(today, 6);
        break;
      default:
        startDate = subMonths(today, 6);
    }

    const months = eachMonthOfInterval({ start: startDate, end: today });
    const monthlyData = months.map(month => {
      const start = startOfMonth(month),
        end = endOfMonth(month);
      let total = 0,
        done = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (
          (selectedHabit.trackingDays?.includes(dayOfWeek) ?? true) &&
          d <= today
        ) {
          total++;
          if (completions[format(d, 'yyyy-MM-dd')] === 'completed') done++;
        }
      }
      return Math.round(total ? (done / total) * 100 : 0);
    });

    setChartData(monthlyData);
    setLoading(false);
  };

  // Export functionality with high quality
  const exportGraph = async () => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Graph export is available with Premium subscription. Upgrade to unlock this feature!',
        [
          { text: 'Maybe Later', style: 'cancel' },
          {
            text: 'Upgrade to Premium',
            onPress: () => {
              onClose();
              onUpgradePremium?.();
            },
          },
        ]
      );
      return;
    }

    try {
      setExporting(true);

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant photo library access to save your progress graph.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Grant Permission',
              onPress: () => MediaLibrary.requestPermissionsAsync(),
            },
          ]
        );
        setExporting(false);
        return;
      }

      // Wait for UI to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture with high quality settings - let it auto-size based on content
      const uri = await captureRef(graphRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
        // Remove fixed dimensions to maintain aspect ratio
      });

      // Show export options
      Alert.alert(
        'Export Progress Graph',
        'How would you like to share your progress?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save to Photos', onPress: () => saveToPhotos(uri) },
          { text: 'Share', onPress: () => shareGraph(uri) },
        ]
      );
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert(
        'Export Failed',
        'Unable to export your progress graph. Please try again.'
      );
    } finally {
      setExporting(false);
    }
  };

  const saveToPhotos = async uri => {
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Success!', 'Your progress graph has been saved to Photos.', [
        { text: 'Great!', style: 'default' },
      ]);
    } catch (error) {
      console.error('Save to photos error:', error);
      Alert.alert('Save Failed', 'Unable to save to Photos. Please try again.');
    }
  };

  const shareGraph = async uri => {
    try {
      const fileName = `${selectedHabit.name.replace(/[^a-zA-Z0-9]/g, '_')}_progress_${format(new Date(), 'yyyy_MM_dd')}.png`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: uri,
        to: fileUri,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: `Share ${selectedHabit.name} Progress`,
        });
      } else {
        Alert.alert(
          'Sharing not available',
          'Sharing is not available on this device.'
        );
      }

      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert(
        'Share Failed',
        'Unable to share your progress graph. Please try again.'
      );
    }
  };

  const color = selectedHabit?.color || '#4CAF50';

  const labels = chartData.map((_, i) =>
    format(
      eachMonthOfInterval({
        start: subMonths(new Date(), chartData.length - 1),
        end: new Date(),
      })[i],
      'MMM'
    )
  );

  const chartConfig = {
    backgroundGradientFrom: theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    backgroundGradientTo: theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    color: (opacity = 1) => color,
    labelColor: (opacity = 1) => (theme === 'dark' ? '#8E8E93' : '#666666'),
    strokeWidth: 3,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: theme === 'dark' ? '#2C2C2E' : '#E0E0E0',
      strokeWidth: 1,
    },
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: color,
      fill: '#FFFFFF',
    },
    decimalPlaces: 0,
  };

  const trend = () => {
    if (chartData.length < 2) return '';
    const recent = chartData.slice(-3);
    const older = chartData.slice(0, -3);
    const avgR = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgO = older.length
      ? older.reduce((a, b) => a + b, 0) / older.length
      : 0;
    return avgR > avgO + 10
      ? '📈 Great improvement!'
      : avgR < avgO - 10
        ? '📉 Your consistency has declined.'
        : '➡️ Your consistency is stable.';
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            backgroundColor:
              theme === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
          },
        ]}
      >
        <View
          style={[
            styles.modal,
            { backgroundColor: theme === 'dark' ? '#1C1C1E' : '#FFF' },
          ]}
        >
          <View style={styles.header}>
            <Text
              style={[
                styles.title,
                { color: theme === 'dark' ? '#FFF' : '#333' },
              ]}
            >
              Progress Graph
            </Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={[
                  styles.exportButton,
                  {
                    backgroundColor: isPremium ? color : '#8E8E93',
                    opacity: exporting ? 0.6 : 1,
                  },
                ]}
                onPress={exportGraph}
                disabled={exporting}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.exportButtonText}>
                    {isPremium ? '📤 Export' : '🔒 Export'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text
                  style={[
                    styles.closeButtonText,
                    { color: theme === 'dark' ? '#8E8E93' : '#666' },
                  ]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Habit Info Card */}
            <View
              style={[
                styles.info,
                { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <View style={styles.habitInfo}>
                <Text
                  style={[
                    styles.habitTitle,
                    { color: theme === 'dark' ? '#FFF' : '#333' },
                  ]}
                >
                  {selectedHabit.name}
                </Text>
                {selectedHabit.description ? (
                  <Text
                    style={[
                      styles.habitDescription,
                      { color: theme === 'dark' ? '#8E8E93' : '#666' },
                    ]}
                  >
                    {selectedHabit.description}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Time Range Selector */}
            <View style={styles.rangeContainer}>
              {['3months', '6months', '1year', 'all'].map(val => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setTimeRange(val)}
                  style={[
                    styles.rangeBtn,
                    {
                      backgroundColor:
                        timeRange === val ? color : 'transparent',
                      borderColor:
                        timeRange === val
                          ? color
                          : theme === 'dark'
                            ? '#38383A'
                            : '#E0E0E0',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.rangeBtnText,
                      {
                        color:
                          timeRange === val
                            ? '#FFF'
                            : theme === 'dark'
                              ? '#8E8E93'
                              : '#666',
                        fontWeight: timeRange === val ? '600' : '500',
                      },
                    ]}
                  >
                    {val === 'all' ? 'All Time' : val.replace('months', ' mo')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={color} />
                <Text
                  style={[
                    styles.loadingText,
                    { color: theme === 'dark' ? '#8E8E93' : '#666' },
                  ]}
                >
                  Loading your progress...
                </Text>
              </View>
            ) : chartData.length > 0 ? (
              <>
                {/* Graph Container - This gets captured */}
                <View
                  ref={graphRef}
                  style={[
                    styles.graphContainer,
                    {
                      backgroundColor: theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
                    },
                  ]}
                  collapsable={false}
                >
                  {/* Export Header */}
                  <View style={styles.exportHeader}>
                    <Text
                      style={[
                        styles.exportTitle,
                        { color: theme === 'dark' ? '#FFF' : '#333' },
                      ]}
                    >
                      {selectedHabit.name} Progress
                    </Text>
                    <Text
                      style={[
                        styles.exportSubtitle,
                        { color: theme === 'dark' ? '#8E8E93' : '#666' },
                      ]}
                    >
                      HabitTracker • {format(new Date(), 'MMM yyyy')}
                    </Text>
                  </View>

                  {/* Chart */}
                  {Platform.OS === 'web' ? (
                    <View style={styles.webFallback}>
                      <Text
                        style={{ color: theme === 'dark' ? '#FFF' : '#333' }}
                      >
                        Chart not available on web
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.chartWrapper}>
                      <LineChart
                        data={{
                          labels,
                          datasets: [
                            {
                              data: chartData,
                              color: (opacity = 1) => color,
                              strokeWidth: 3,
                            },
                          ],
                        }}
                        width={screenWidth - 80}
                        height={220}
                        chartConfig={chartConfig}
                        bezier
                        style={styles.chart}
                        withInnerLines={true}
                        withOuterLines={false}
                        withVerticalLines={true}
                        withHorizontalLines={true}
                        withVerticalLabels={true}
                        withHorizontalLabels={true}
                        segments={4}
                        fromZero
                        yAxisLabel=""
                        yAxisSuffix="%"
                      />
                    </View>
                  )}

                  {/* Stats Grid */}
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color }]}>
                        {chartData[chartData.length - 1] || 0}%
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme === 'dark' ? '#8E8E93' : '#666' },
                        ]}
                      >
                        Current Month
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statDivider,
                        {
                          backgroundColor:
                            theme === 'dark' ? '#38383A' : '#E0E0E0',
                        },
                      ]}
                    />
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color }]}>
                        {Math.round(
                          chartData.reduce((a, b) => a + b, 0) /
                            chartData.length
                        )}
                        %
                      </Text>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme === 'dark' ? '#8E8E93' : '#666' },
                        ]}
                      >
                        Average
                      </Text>
                    </View>
                  </View>

                  {/* Trend */}
                  <View style={styles.trendContainer}>
                    <Text
                      style={[
                        styles.trendText,
                        { color: theme === 'dark' ? '#8E8E93' : '#666' },
                      ]}
                    >
                      {trend()}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text
                  style={[
                    styles.emptyStateText,
                    { color: theme === 'dark' ? '#8E8E93' : '#666' },
                  ]}
                >
                  No data available for this period
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#38383A',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exportButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  exportButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '500',
  },
  scrollContent: {
    paddingVertical: 20,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  habitInfo: {
    flex: 1,
  },
  habitTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  habitDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  rangeContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 8,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  rangeBtnText: {
    fontSize: 13,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  graphContainer: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  exportHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  exportTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  exportSubtitle: {
    fontSize: 12,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  chart: {
    borderRadius: 8,
    paddingRight: 0,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 20,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  trendContainer: {
    alignItems: 'center',
  },
  trendText: {
    fontSize: 14,
    fontWeight: '500',
  },
  webFallback: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
