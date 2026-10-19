import { router, useFocusEffect } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { MotionPressable, settle } from './motion';
import { colors, Icon, type IconName, styles } from './ui';

export const dalatImage = require('../../../../assets/brand/dalat-illustration.png');
export function Brand({ slogan = false }: { slogan?: boolean }) {
  return <View style={{ gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Image source={require('../../../../assets/brand/logo.png')} accessibilityLabel="Logo GoEase" style={{ width: 31, height: 31, borderRadius: 16 }} resizeMode="cover" />
    <Text style={{ color: colors.tealDark, fontSize: 23, fontWeight: '800', letterSpacing: -1 }}>GoEase</Text>
  </View>{slogan && <Text style={{ color: '#9B612E', fontSize: 13, fontStyle: 'italic', paddingLeft: 48 }}>Just go. We’ll plan.</Text>}</View>;
}
export function DestinationCover({ children, height = 180, home = false }: { children?: ReactNode; height?: number; home?: boolean }) {
  return <View style={{ minHeight: height, borderRadius: home ? 0 : 14, overflow: 'hidden', backgroundColor: colors.cream }}>
    <Image source={dalatImage} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
    <LinearGradient colors={home ? ['#FFF8EFF5', '#FFF8EF55', '#FFF8EF00'] : ['#123E4B00', '#123E4B88']} locations={home ? [0, 0.48, 1] : undefined} style={{ minHeight: height, padding: home ? 16 : 18, justifyContent: home ? 'flex-start' : 'flex-end', gap: 8 }}>{children}</LinearGradient>
  </View>;
}
export function BottomNav({ active = 'home', onTrips, onHome }: { active?: 'home' | 'trips'; onTrips?: () => void; onHome?: () => void }) {
  const activeIndex = active === 'home' ? 0 : 1;
  const [selected, setSelected] = useState(activeIndex);
  const [width, setWidth] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  const reducedMotion = useReducedMotion();
  const left = useSharedValue(0), right = useSharedValue(0);
  useFocusEffect(useCallback(() => {
    leaving.current = false;
    setSelected(activeIndex);
    return () => { if (pending.current) clearTimeout(pending.current); pending.current = null; };
  }, [activeIndex]));
  useEffect(() => {
    if (!width) return;
    const cell = width / 4;
    // The leading edge travels first; the trailing edge catches up like soft rubber.
    const nextLeft = selected * cell + 4, nextRight = (selected + 1) * cell - 4;
    const forward = nextLeft > left.value;
    left.set(withSpring(nextLeft, { ...settle, stiffness: forward ? 210 : 470, damping: 25 }));
    right.set(withSpring(nextRight, { ...settle, stiffness: forward ? 470 : 210, damping: 25 }));
  }, [selected, width, left, right]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: left.value }], width: Math.max(0, right.value - left.value) }));
  const items: { label: string; icon: IconName; filled: IconName; onPress: () => void }[] = [
    { label: 'Trang chủ', icon: 'home-outline', filled: 'home', onPress: () => onHome?.() },
    { label: 'Chuyến đi', icon: 'briefcase-outline', filled: 'briefcase', onPress: () => onTrips?.() },
    { label: 'Tài khoản', icon: 'person-outline', filled: 'person', onPress: () => router.push('/account') },
    { label: 'Giới thiệu', icon: 'compass-outline', filled: 'compass', onPress: () => router.push('/about') },
  ];
  function select(index: number) {
    if (leaving.current) return;
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    setSelected(index);
    // Stack destinations keep their existing back behavior; let the touch feedback land first.
    if (index > 1 && !reducedMotion) pending.current = setTimeout(() => { pending.current = null; leaving.current = true; items[index].onPress(); }, 180);
    else { leaving.current = index > 1; items[index].onPress(); }
  }
  return <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper }}>
    <View style={{ maxWidth: 640, alignSelf: 'center', width: '100%', paddingVertical: 7, paddingHorizontal: 8 }}>
      <View onLayout={event => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth === width) return;
        left.set(selected * nextWidth / 4 + 4);
        right.set((selected + 1) * nextWidth / 4 - 4);
        setWidth(nextWidth);
      }} style={{ flexDirection: 'row' }}>
        <Animated.View pointerEvents="none" accessible={false} testID="bottom-nav-rubber" style={[{ position: 'absolute', top: 2, bottom: 2, left: 0, borderRadius: 19, backgroundColor: colors.mint, opacity: width ? 1 : 0 }, thumb]} />
        {items.map((item, index) => <MotionPressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: selected === index }} onPress={() => select(index)} pressScale={0.95}
          style={{ flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 3 }}>
          <Icon name={selected === index ? item.filled : item.icon} color={selected === index ? colors.tealDark : colors.muted} size={21} />
          <Text style={[styles.caption, { color: selected === index ? colors.tealDark : colors.muted, fontWeight: selected === index ? '700' : '500', textAlign: 'center', fontSize: 11 }]}>{item.label}</Text>
        </MotionPressable>)}
      </View>
    </View>
  </View>;
}
