import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { colors, radius, space, typography } from './theme';
import logo from '../../assets/brand/goease-logo.jpg';
import sunset from '../../assets/halong-sunset.jpg';

export function Brand() {
  return <View style={styles.brand} accessible accessibilityLabel="GoEase">
    <Image source={logo} style={styles.logo} resizeMode="contain" accessible={false} />
    <Text style={styles.wordmark}>GoEase</Text>
  </View>;
}
export function Action({ label, onPress, disabled = false, secondary = false, selected, accent = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean; accent?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, accent && styles.accent, selected && styles.selected, disabled && styles.disabled,
      pressed && { backgroundColor: accent ? colors.sunsetPressed : selected || !secondary ? colors.tealPressed : colors.softPressed }]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText, accent && styles.accentText, selected && styles.selectedText]}>{label}</Text>
  </Pressable>;
}
export function Field({ label, value, onChange, numeric = false, multiline = false, editable = true, hint }: {
  label: string; value: string; onChange: (value: string) => void; numeric?: boolean; multiline?: boolean; editable?: boolean; hint?: string | undefined;
}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityHint={hint} value={value} onChangeText={onChange} editable={editable}
      inputMode={numeric ? 'numeric' : 'text'} multiline={multiline} autoCorrect={false}
      style={[styles.input, multiline && styles.multiline, !editable && styles.disabled]} />
    {hint && <Text style={styles.small}>{hint}</Text>}
  </View>;
}
export function TravelHero({ onCreate, disabled = false }: { onCreate?: () => void; disabled?: boolean }) {
  return <View style={styles.hero}>
    <View style={styles.heroCopy}><Text style={styles.eyebrow}>CÙNG NHAU LÊN ĐƯỜNG</Text>
      <Text accessibilityRole="header" style={styles.heading}>Đi để có{ '\n' }chuyện kể.</Text>
      <Text style={styles.body}>Một hành trình vừa ý.{ '\n' }Nhiều khoảnh khắc cùng nhau.</Text></View>
    <Image source={sunset} resizeMode="cover" style={styles.heroImage} accessibilityLabel="Ảnh minh họa hoàng hôn trên vịnh Hạ Long" />
    {onCreate && <View style={styles.heroAction}><Action label="＋  Tạo chuyến mẫu" accent disabled={disabled} onPress={onCreate} /></View>}
  </View>;
}
export function PhotoCredit() {
  const [failed, setFailed] = useState(false);
  function open(url: string) { setFailed(false); void Linking.openURL(url).catch(() => setFailed(true)); }
  return <View style={styles.credit}><Text style={styles.small}>Ảnh minh họa Hạ Long · © Vyacheslav Argenberg. Ảnh thu nhỏ, cắt khung khi trình bày.</Text>
    <Pressable accessibilityRole="link" onPress={() => open('https://commons.wikimedia.org/wiki/File:Ha_Long_Bay,_Vietnam,_Sunset_in_Ha_Long_Bay.jpg')} style={styles.creditLink}>
      <Text style={styles.linkText}>Nguồn ảnh · Wikimedia Commons</Text></Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel="Giấy phép ảnh Hạ Long: Creative Commons BY 4.0" onPress={() => open('https://creativecommons.org/licenses/by/4.0/')} style={styles.creditLink}>
      <Text style={styles.linkText}>Giấy phép · CC BY 4.0</Text></Pressable>
    {failed && <Text accessibilityLiveRegion="polite" style={styles.small}>Chưa mở được liên kết. Bạn có thể bấm lại để thử.</Text>}</View>;
}
const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  logo: { width: 52, height: 52, backgroundColor: colors.white, borderRadius: radius.input },
  wordmark: { color: colors.teal, fontSize: 26, fontWeight: '800', flexShrink: 1 },
  button: { backgroundColor: colors.teal, borderRadius: radius.button, minHeight: 48, padding: space.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...typography.body, color: colors.white, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  secondary: { backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.teal }, secondaryText: { color: colors.teal },
  accent: { backgroundColor: colors.sunset, borderWidth: 0 }, accentText: { color: colors.ink },
  selected: { backgroundColor: colors.selected }, selectedText: { color: colors.white },
  disabled: { opacity: 0.5 }, field: { gap: space.sm },
  label: { ...typography.body, color: colors.ink, fontWeight: '600' },
  input: { ...typography.body, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.input, padding: space.md, minHeight: 48, color: colors.ink },
  multiline: { minHeight: 120, textAlignVertical: 'top' }, small: { ...typography.small, color: colors.muted },
  hero: { backgroundColor: colors.white, borderRadius: radius.hero, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  heroCopy: { padding: space.xl, gap: space.sm }, eyebrow: { ...typography.eyebrow, color: colors.teal },
  heading: { ...typography.heading, color: colors.ink }, body: { ...typography.body, color: colors.muted },
  heroImage: { width: '100%', height: 170 }, heroAction: { padding: space.lg },
  credit: { gap: space.xs }, creditLink: { minHeight: 48, justifyContent: 'center' }, linkText: { ...typography.small, color: colors.teal, textDecorationLine: 'underline' },
});
