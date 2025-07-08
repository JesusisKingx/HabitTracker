import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ColorPicker from 'react-native-wheel-color-picker';

export default function ColorPickerModal({
  visible,
  initialColor,
  onClose,
  onSelect,
}) {
  const [color, setColor] = useState(initialColor || '#4CAF50');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>🎨 Pick a Color</Text>

          {/* Preview Circle */}
          <View style={[styles.previewCircle, { backgroundColor: color }]} />

          <ColorPicker
            color={color}
            onColorChangeComplete={setColor}
            swatches={false}
            sliderHidden={true}
            thumbSize={28}
            noSnap={true}
            row={false}
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirm}
              onPress={() => {
                onSelect(color);
                onClose();
              }}
            >
              <Text style={styles.buttonText}>Select</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingVertical: 18, // 🔼 Increase for more height to fit color wheel and buttons
    paddingHorizontal: 28, // 🔼 Increase to widen modal (try 28–32)
    width: '80%', // 🔼 Wider modal — adjust between '90%' and '95%' if needed
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  previewCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ccc',
  },

  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 210, // 🔼 Push buttons further down (closer to bottom)
    paddingHorizontal: -10, // 🔁 Add spacing around buttons
  },
  cancel: {
    backgroundColor: '#ccc',
    paddingVertical: 12, // 🔁 Increase for taller buttons
    paddingHorizontal: 24, // 🔁 Wider buttons
    borderRadius: 12,
  },
  confirm: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    fontWeight: '600',
    color: '#FFF',
    fontSize: 16,
  },
});
