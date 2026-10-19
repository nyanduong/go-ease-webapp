import { useFocusEffect } from 'expo-router';
import { type RefObject, useCallback } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';

// Android can finish resizing after its initial scroll-to-focus. Measure again
// once the keyboard is visible, including the navigation header above the form.
export function useKeyboardScroll(scroll: RefObject<ScrollView | null>) {
  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let frame: number | undefined;
    const listener = Keyboard.addListener('keyboardDidShow', () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = scroll.current;
        const input = TextInput.State.currentlyFocusedInput();
        if (!active || !view || !input) return;
        view.getNativeScrollRef()?.measureInWindow((_x: number, y: number) => {
          if (active && scroll.current === view && TextInput.State.currentlyFocusedInput() === input) {
            view.scrollResponderScrollNativeHandleToKeyboard(input, y + 64, true);
          }
        });
      });
    });
    return () => { active = false; listener.remove(); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [scroll]));
}
