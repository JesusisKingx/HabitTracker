import * as shape from 'd3-shape';
import {
  eachMonthOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Grid, LineChart, XAxis, YAxis } from 'react-native-svg-charts';

const { width: screenWidth } = Dimensions.get('window');

const ProgressGraph = ({
  visible,
  onClose,
  habitData,
  selectedHabit,
  theme,
}) => {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6months'); // '3months', '6months', '1year', 'all'

  useEffect(() => {
    if (visible && selectedHabit && habitData[selectedHabit.id]) {
      processHabitData();
    }
  }, [visible, selectedHabit, timeRange, habitData]);

  const processHabitData = () => {
    setLoading(true);

    const habitCompletions = habitData[selectedHabit.id] || {};
    const today = new Date();
    let startDate;

    // Determine date range
    switch (timeRange) {
      case '3months':
        startDate = subMonths(today, 3);
        break;
      case '6months':
        startDate = subMonths(today, 6);
        break;
      case '1year':
        startDate = subMonths(today, 12);
        break;
      case 'all':
        // Find earliest date in data
        const dates = Object.keys(habitCompletions).sort();
        startDate = dates.length > 0 ? parseISO(dates[0]) : subMonths(today, 6);
        break;
      default:
        startDate = subMonths(today, 6);
    }

    // Get all months in range
    const months = eachMonthOfInterval({
      start: startDate,
      end: today,
    });

    // Calculate completion percentage for each month
    const monthlyData = months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      let totalDays = 0;
      let completedDays = 0;

      // Check each day in the month
      for (
        let d = new Date(monthStart);
        d <= monthEnd;
        d.setDate(d.getDate() + 1)
      ) {
        const dateString = format(d, 'yyyy-MM-dd');
        const dayOfWeek = d.getDay();

        // Only count days that are in the tracking schedule
        if (selectedHabit.trackingDays?.includes(dayOfWeek) ?? true) {
          // Don't count future days
          if (d <= today) {
            totalDays++;
            if (habitCompletions[dateString] === 'completed') {
              completedDays++;
            }
          }
        }
      }

      const percentage =
        totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

      return {
        month: format(month, 'MMM'),
        year: format(month, 'yyyy'),
        value: percentage,
        totalDays,
        completedDays,
      };
    });

    setChartData(monthlyData);
    setLoading(false);
  };

  const getChartColor = () => {
    return selectedHabit?.color || '#4CAF50';
  };

  const axesSvg = {
    fontSize: 10,
    fill: theme === 'dark' ? '#8E8E93' : '#666666',
  };
  const verticalContentInset = { top: 10, bottom: 10 };
  const xAxisHeight = 30;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View
        style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
      >
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme === 'dark' ? '#1C1C1E' : '#FFFFFF' },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text
              style={[
                styles.modalTitle,
                { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
              ]}
            >
              Progress Graph
            </Text>
            <TouchableOpacity
              style={[
                styles.closeButton,
                { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F5F5F5' },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.closeButtonText,
                  { color: theme === 'dark' ? '#FFFFFF' : '#666666' },
                ]}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            {/* Habit Info */}
            <View
              style={[
                styles.habitInfo,
                { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
              ]}
            >
              <View
                style={[styles.colorDot, { backgroundColor: getChartColor() }]}
              />
              <View style={styles.habitTextContainer}>
                <Text
                  style={[
                    styles.habitName,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  {selectedHabit?.name || 'Habit'}
                </Text>
                {selectedHabit?.description && (
                  <Text
                    style={[
                      styles.habitDescription,
                      { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                    ]}
                  >
                    {selectedHabit.description}
                  </Text>
                )}
              </View>
            </View>

            {/* Time Range Selector */}
            <View style={styles.timeRangeContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[
                  { value: '3months', label: '3 Months' },
                  { value: '6months', label: '6 Months' },
                  { value: '1year', label: '1 Year' },
                  { value: 'all', label: 'All Time' },
                ].map(range => (
                  <TouchableOpacity
                    key={range.value}
                    style={[
                      styles.timeRangeButton,
                      timeRange === range.value && styles.timeRangeButtonActive,
                      timeRange === range.value && {
                        backgroundColor: getChartColor(),
                      },
                      { borderColor: theme === 'dark' ? '#38383A' : '#E0E0E0' },
                    ]}
                    onPress={() => setTimeRange(range.value)}
                  >
                    <Text
                      style={[
                        styles.timeRangeText,
                        { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                        timeRange === range.value && styles.timeRangeTextActive,
                      ]}
                    >
                      {range.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Chart */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={getChartColor()} />
              </View>
            ) : chartData.length > 0 ? (
              <View style={styles.chartContainer}>
                <Text
                  style={[
                    styles.chartTitle,
                    { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                  ]}
                >
                  Monthly Completion Rate (%)
                </Text>

                <View
                  style={{
                    height: 250,
                    paddingHorizontal: 10,
                    flexDirection: 'row',
                  }}
                >
                  <YAxis
                    data={chartData.map(d => d.value)}
                    contentInset={verticalContentInset}
                    svg={axesSvg}
                    numberOfTicks={5}
                    formatLabel={value => `${value}%`}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <LineChart
                      style={{ flex: 1 }}
                      data={chartData.map(d => d.value)}
                      svg={{
                        stroke: getChartColor(),
                        strokeWidth: 3,
                      }}
                      contentInset={verticalContentInset}
                      curve={shape.curveMonotoneX}
                    >
                      <Grid
                        svg={{
                          stroke: theme === 'dark' ? '#38383A' : '#E0E0E0',
                        }}
                      />
                    </LineChart>
                    <XAxis
                      style={{ marginHorizontal: -10, height: xAxisHeight }}
                      data={chartData}
                      formatLabel={(value, index) =>
                        chartData[index]?.month || ''
                      }
                      contentInset={{ left: 20, right: 20 }}
                      svg={axesSvg}
                    />
                  </View>
                </View>

                {/* Stats Summary */}
                <View
                  style={[
                    styles.statsContainer,
                    {
                      backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA',
                    },
                  ]}
                >
                  <View style={styles.statItem}>
                    <Text
                      style={[styles.statValue, { color: getChartColor() }]}
                    >
                      {chartData.length > 0
                        ? chartData[chartData.length - 1].value
                        : 0}
                      %
                    </Text>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                      ]}
                    >
                      Current Month
                    </Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text
                      style={[
                        styles.statValue,
                        { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                      ]}
                    >
                      {chartData.length > 0
                        ? Math.round(
                            chartData.reduce((sum, d) => sum + d.value, 0) /
                              chartData.length
                          )
                        : 0}
                      %
                    </Text>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                      ]}
                    >
                      Average
                    </Text>
                  </View>
                </View>

                {/* Trend Analysis */}
                {chartData.length >= 2 && (
                  <View
                    style={[
                      styles.trendContainer,
                      {
                        backgroundColor:
                          theme === 'dark' ? '#2C2C2E' : '#F8F9FA',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.trendText,
                        { color: theme === 'dark' ? '#FFFFFF' : '#333333' },
                      ]}
                    >
                      {getTrendAnalysis()}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.noDataContainer}>
                <Text
                  style={[
                    styles.noDataText,
                    { color: theme === 'dark' ? '#8E8E93' : '#666666' },
                  ]}
                >
                  No data available for the selected period
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  function getTrendAnalysis() {
    if (chartData.length < 2) return '';

    const recent = chartData.slice(-3).map(d => d.value);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const older = chartData.slice(0, -3).map(d => d.value);
    const avgOlder =
      older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;

    if (avgRecent > avgOlder + 10) {
      return '📈 Great improvement! Your consistency is trending upward.';
    } else if (avgRecent < avgOlder - 10) {
      return '📉 Your consistency has declined recently. Time to refocus!';
    } else {
      return '➡️ Your consistency is stable. Keep up the steady progress!';
    }
  }
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '95%',
    maxHeight: '90%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    maxHeight: '100%',
  },
  habitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    margin: 16,
    borderRadius: 8,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  habitTextContainer: {
    flex: 1,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
  },
  habitDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  timeRangeContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  timeRangeButtonActive: {
    borderWidth: 0,
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  timeRangeTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 16,
    marginTop: 20,
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
  },
  trendContainer: {
    padding: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  trendText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  noDataContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 16,
  },
});

export default ProgressGraph;
