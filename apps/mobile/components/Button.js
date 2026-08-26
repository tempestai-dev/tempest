import { View, Pressable, Text } from 'react-native';

// Primary onboarding-style button: white pill, dark label, right-aligned trailing glyph.
// Matches .ob-blank-btn / .ob-metal on desktop.
export default function Button({ label, onPress, trailing = '→', style }) {
  return (
    <View style={[{ backgroundColor: '#ffffff', borderRadius: 8, width: '100%' }, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          paddingVertical: 21,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: '#0c0d10', fontSize: 19, fontFamily: 'Geist_600SemiBold', letterSpacing: 0.2 }}>
          {label}
        </Text>
        {typeof trailing === 'string'
          ? (
            <View style={{ transform: [{ rotate: '-45deg' }] }}>
              <Text style={{ color: '#0c0d10', fontSize: 28, fontFamily: 'Geist_400Regular' }}>{trailing}</Text>
            </View>
          )
          : trailing}
      </Pressable>
    </View>
  );
}
