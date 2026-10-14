import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.brand}>GoEase</Text>
          <Text style={styles.eyebrow}>CÙNG NHAU LÊN ĐƯỜNG</Text>
          <Text accessibilityRole="header" style={styles.title}>Chuyến đi hay bắt đầu từ một ý tưởng.</Text>
          <Text style={styles.description}>Một nơi để cả nhóm cùng lên lịch trình và tận hưởng những trải nghiệm tại Việt Nam.</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Chào mừng đến với GoEase</Text>
            <Text style={styles.description}>Đây là bản khởi tạo. Các tính năng lập lịch trình và lưu chuyến sẽ được team phát triển tiếp.</Text>
          </View>
          <Link href="/about" asChild>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Về GoEase</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8F5' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 20 },
  brand: { fontSize: 30, fontWeight: '800', color: '#125C46' },
  eyebrow: { fontSize: 12, letterSpacing: 2, fontWeight: '700', color: '#426852' },
  title: { fontSize: 36, lineHeight: 44, fontWeight: '700', color: '#172A23' },
  description: { fontSize: 16, lineHeight: 26, color: '#465A50' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, gap: 12 },
  cardTitle: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: '#172A23' },
  button: { minHeight: 48, backgroundColor: '#125C46', borderRadius: 14, padding: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  pressed: { opacity: 0.8 },
});
