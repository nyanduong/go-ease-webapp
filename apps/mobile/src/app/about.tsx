import { DESTINATION, TRIP_LIMITS } from '@goease/contracts';
import { CATALOG_INFO, getDalatPlaces } from '@goease/catalog';
import { SAMPLE_LABEL } from '@goease/itinerary';
import { Link, router } from 'expo-router';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand, DestinationCover } from '../features/trips/components/brand';
import { Action, Badge, Disclosure, SectionTitle, styles } from '../features/trips/components/ui';

const catalogSize = getDalatPlaces().length;

export default function AboutScreen() {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Brand slogan />
        <DestinationCover height={200}><Text accessibilityRole="header" style={[styles.heading, { color: 'white' }]}>Đi cùng nhau,{ '\n' }khám phá nhiều hơn.</Text></DestinationCover>
        <Text style={styles.text}>GoEase hướng tới việc giúp nhóm bạn lên kế hoạch du lịch tại Việt Nam, chỉnh lịch trình và theo dõi ngân sách chung.</Text>
        <View style={styles.card}><SectionTitle title="Một kế hoạch, cùng nhau hoàn thiện" icon="compass-outline" /><Text style={styles.text}>Tạo, xem và chỉnh lịch trình; theo dõi ngân sách nhóm và xem bản đồ theo ngày trên điện thoại. Chuyến khách được lưu ngay trên thiết bị.</Text><Text style={styles.text}>Đăng nhập trên điện thoại để quản lý chuyến của tài khoản qua máy chủ. AI nội bộ cần phiên HTTPS được cấp phép.</Text><Badge>{DESTINATION.name} · 1–{TRIP_LIMITS.maxDays} ngày · Tối đa {TRIP_LIMITS.maxPeople} người</Badge></View>
        <Action title="Chỗ nghỉ & chuyến bay" secondary icon="airplane-outline" onPress={() => router.push('/travel-services')} />
        <Disclosure title="Dữ liệu và lịch trình gợi ý" subtitle={`${catalogSize} địa điểm trong danh mục demo`}><Text style={styles.text}>{CATALOG_INFO.label}</Text><Text style={styles.text}>{SAMPLE_LABEL}</Text><Text style={styles.caption}>Giờ và giá là gợi ý, chưa xác minh giờ mở cửa, thời gian di chuyển hoặc tối ưu tuyến. Hãy kiểm tra trước chuyến đi.</Text></Disclosure>
        <Disclosure title="Hình ảnh và ghi công"><Text style={styles.text}>Nền du lịch Đà Lạt là tranh minh họa được tạo cho giao diện GoEase, không phải ảnh chụp địa điểm hay dịch vụ thực tế. Logo và slogan thuộc bộ nhận diện GoEase. Ảnh “The Dalat Lake” của Caitlin Childs (CC BY-SA 2.0) được giữ trong bộ tài nguyên dự án.</Text><Action title="Nguồn ảnh Đà Lạt" secondary icon="open-outline" onPress={() => { void Linking.openURL('https://commons.wikimedia.org/wiki/File:The_Dalat_Lake_(3599592258).jpg'); }} /><Action title="Giấy phép CC BY-SA 2.0" secondary icon="open-outline" onPress={() => { void Linking.openURL('https://creativecommons.org/licenses/by-sa/2.0/'); }} /></Disclosure>
        {__DEV__ && <Disclosure title="Công cụ phát triển" subtitle="Kiểm tra lưu trữ, API và phiên nội bộ"><Link href="/storage-check" style={styles.text}>Kiểm tra lưu chuyến</Link><Link href="/catalog-check" style={styles.text}>Kiểm tra danh mục API</Link><Link href="/https-check" style={styles.text}>Kiểm tra HTTPS API</Link><Link href="/auth-check" style={styles.text}>Kiểm tra tài khoản</Link></Disclosure>}
        <Text style={[styles.caption, { textAlign: 'center' }]}>GoEase · Just go. We’ll plan.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
