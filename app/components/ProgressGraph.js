import {
  eachMonthOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

const { width: screenWidth } = Dimensions.get('window');

export default function ProgressGraph({
  visible,
  onClose,
  habitData,
  selectedHabit,
  theme,
}) {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6months');

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

  const config = {
    backgroundGradientFrom: theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    backgroundGradientTo: theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    color: () => color,
    labelColor: () => (theme === 'dark' ? '#8E8E93' : '#666666'),
    strokeWidth: 3,
    propsForDots: { r: '4', strokeWidth: '2', stroke: color },
  };

  const trend = () => {
    if (chartData.length < 2) return '';
    const recent = chartData.slice(-3),
      older = chartData.slice(0, -3);
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
            <TouchableOpacity onPress={onClose}>
              <Text
                style={{
                  fontSize: 18,
                  color: theme === 'dark' ? '#FFF' : '#666',
                }}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View
              style={[
                styles.info,
                { backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F8F9FA' },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <View>
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
                    style={{
                      color: theme === 'dark' ? '#8E8E93' : '#666',
                      fontSize: 12,
                    }}
                  >
                    {selectedHabit.description}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginVertical: 12 }}>
              {['3months', '6months', '1year', 'all'].map(val => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setTimeRange(val)}
                  style={[
                    styles.rangeBtn,
                    timeRange === val && { backgroundColor: color },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        timeRange === val
                          ? '#FFF'
                          : theme === 'dark'
                            ? '#FFF'
                            : '#333',
                    }}
                  >
                    {val === 'all' ? 'All Time' : val.replace('months', ' mo')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={color} />
            ) : chartData.length > 0 ? (
              <>
                {Platform.OS === 'web' ? (
                  <View style={styles.webFallback}>
                    <Text style={{ color: theme === 'dark' ? '#FFF' : '#333' }}>
                      Chart not available on web
                    </Text>
                  </View>
                ) : (
                  <LineChart
                    data={{ labels, datasets: [{ data: chartData }] }}
                    width={screenWidth - 64}
                    height={220}
                    chartConfig={config}
                    bezier
                    style={{ borderRadius: 16 }}
                    fromZero
                  />
                )}
                <View style={styles.stats}>
                  <Text style={[styles.statText, { color }]}>
                    {chartData[chartData.length - 1] || 0}%
                  </Text>
                  <Text style={{ color: theme === 'dark' ? '#FFF' : '#333' }}>
                    Current Month
                  </Text>
                  <Text
                    style={{
                      color: theme === 'dark' ? '#FFF' : '#333',
                      marginLeft: 20,
                    }}
                  >
                    {Math.round(
                      chartData.reduce((a, b) => a + b, 0) / chartData.length
                    )}
                    % Avg
                  </Text>
                </View>
                <Text
                  style={{
                    color: theme === 'dark' ? '#FFF' : '#333',
                    marginTop: 12,
                  }}
                >
                  {trend()}
                </Text>
              </>
            ) : (
              <Text
                style={{
                  color: theme === 'dark' ? '#8E8E93' : '#666',
                  textAlign: 'center',
                  marginTop: 20,
                }}
              >
                No data for this period
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modal: {
    width: '90%',
    maxHeight: '90%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#CCC',
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  dot: { width: 16, height: 16, borderRadius: 8, marginRight: 8 },
  habitTitle: { fontSize: 16, fontWeight: '600' },
  rangeBtn: {
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CCC',
    marginRight: 8,
  },
  webFallback: { height: 200, justifyContent: 'center', alignItems: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  statText: { fontSize: 24, fontWeight: 'bold' },
});
