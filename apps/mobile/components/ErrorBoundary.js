import { Component } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

const geist = { regular: 'Geist_400Regular', semibold: 'Geist_600SemiBold' };
const log = (...a) => { if (__DEV__) console.log(...a); };

export default class ErrorBoundary extends Component {
  state = { err: null };

  static getDerivedStateFromError(err) { return { err }; }

  componentDidCatch(err, info) {
    log('[boundary]', err?.message, info?.componentStack);
  }

  reset = () => this.setState({ err: null });

  render() {
    if (!this.state.err) return this.props.children;
    const msg = this.state.err?.message || String(this.state.err);
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', padding: 24, paddingTop: 72 }}>
        <Text style={{ color: '#f5f5f7', fontSize: 22, fontFamily: geist.semibold, marginBottom: 12 }}>
          Something broke.
        </Text>
        <Text style={{ color: '#b8b8c0', fontSize: 14, fontFamily: geist.regular, marginBottom: 20 }}>
          The app hit an unexpected error. Try again — if it keeps happening, quit and reopen.
        </Text>
        <ScrollView style={{ maxHeight: 240, backgroundColor: '#111', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          <Text style={{ color: '#f0b0b0', fontSize: 12, fontFamily: geist.regular }} selectable>
            {msg}
          </Text>
        </ScrollView>
        <Pressable
          onPress={this.reset}
          style={{ backgroundColor: '#ffffff', borderRadius: 8, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#0c0d10', fontSize: 15, fontFamily: geist.semibold }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
