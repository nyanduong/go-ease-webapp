import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export const settle = { damping: 22, stiffness: 320, mass: 0.65, reduceMotion: ReduceMotion.System };

/** Shared touch response. The original Pressable owns gestures, cancellation and accessibility. */
export function MotionPressable({ children, style, pressScale = 0.975, onPressIn, onPressOut, disabled, ...props }:
  Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; pressScale?: number }) {
  const progress = useSharedValue(0);
  useEffect(() => { if (disabled) progress.set(0); }, [disabled, progress]);
  const opacity = StyleSheet.flatten(style)?.opacity;
  const restingOpacity = typeof opacity === 'number' ? opacity : 1;
  const response = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - progress.value * (1 - pressScale) }],
    opacity: restingOpacity * (1 - progress.value * 0.12),
  }));
  return <AnimatedPressable {...props} disabled={disabled} style={[style, response]}
    onPressIn={event => { progress.set(withTiming(1, { duration: 85, reduceMotion: ReduceMotion.System })); onPressIn?.(event); }}
    onPressOut={event => { progress.set(withSpring(0, settle)); onPressOut?.(event); }}>
    {children}
  </AnimatedPressable>;
}
