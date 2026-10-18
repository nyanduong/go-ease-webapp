import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createTravelLinkFlow, getTravelLink, travelLinks, type TravelLinkId } from '../features/trips/travel-links-controller';
import { Action, Badge, colors, ConfirmDialog, Icon, SectionTitle, styles } from '../features/trips/components/ui';

export default function TravelServicesScreen() {
  const [flow] = useState(() => createTravelLinkFlow(url => Linking.openURL(url)));
  const [selection, setSelection] = useState<TravelLinkId | null>(null);
  const [opening, setOpening] = useState(false), [message, setMessage] = useState('');
  const selected = selection ? getTravelLink(selection) : undefined;
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ gap: 7 }}><Badge warm>Website tham khảo</Badge><Text accessibilityRole="header" style={styles.heading}>Một chuyến đi trọn vẹn</Text><Text style={styles.text}>Tìm thêm chỗ nghỉ và chuyến bay cho hành trình của bạn.</Text></View>
      {travelLinks.map(item => <View key={item.id} style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ backgroundColor: item.id === 'stays' ? colors.mint : colors.sand, padding: 12, borderRadius: 14 }}><Icon name={item.icon} size={26} /></View><View style={{ flex: 1, gap: 3 }}><SectionTitle title={item.title} /><Text style={styles.caption}>{item.domain}</Text></View></View>
        <Text style={styles.text}>{item.description}</Text>
        <Action title={`Mở ${item.name}`} secondary icon="open-outline" disabled={opening} onPress={() => { if (flow.select(item.id)) { setMessage(''); setSelection(item.id); } }} />
      </View>)}
      <View style={styles.notice}><SectionTitle title="Bạn đặt trực tiếp trên website bên ngoài" icon="information-circle-outline" /><Text style={styles.text}>Giá và điều kiện do website bên ngoài cung cấp. GoEase chỉ mở website, không nhận thanh toán hay xác nhận đặt phòng/vé.</Text><Text style={styles.caption}>Liên kết không gửi kèm thông tin chuyến đi hoặc tài khoản GoEase. Bạn tự kiểm tra thông tin và điều kiện trước khi đặt.</Text></View>
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>}
    </ScrollView>
    <ConfirmDialog visible={!!selected} title={`Mở ${selected?.name ?? 'website'}?`} message={`Bạn sẽ rời GoEase để mở ${selected?.domain ?? ''}. GoEase không gửi kèm dữ liệu chuyến đi và không đặt dịch vụ thay bạn.`} confirm="Mở website" busy={opening}
      onCancel={() => { flow.cancel(); setSelection(null); }} onConfirm={() => {
        setOpening(true);
        void flow.confirm().then(result => setMessage(result.message)).finally(() => { setOpening(false); setSelection(null); });
      }} />
  </SafeAreaView>;
}
