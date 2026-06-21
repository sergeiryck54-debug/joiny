import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './lib/supabase';

const LANGS = ['EN', 'RU', 'TH'] as const;
type Lang = typeof LANGS[number];

const T: Record<Lang, any> = {
  EN: {
    title1: 'Find your', title2: 'people', title3: ',\nright now',
    sub: "Enter your email — we'll send a code",
    emailPh: 'your@email.com', send: 'Send code',
    checkTitle1: 'Check your', checkTitle2: 'email',
    checkSub: 'We sent a code to', verify: 'Verify & Enter',
    back: '← Use a different email',
    errEmail: 'Enter a valid email', errCode: 'Enter the code', errNet: 'Network error. Try again.',
  },
  RU: {
    title1: 'Найди своих', title2: 'людей', title3: '\nпрямо сейчас',
    sub: 'Введи email — пришлём код',
    emailPh: 'твой@email.com', send: 'Получить код',
    checkTitle1: 'Проверь свою', checkTitle2: 'почту',
    checkSub: 'Мы отправили код на', verify: 'Подтвердить',
    back: '← Другой email',
    errEmail: 'Введи корректный email', errCode: 'Введи код', errNet: 'Ошибка сети. Попробуй ещё.',
  },
  TH: {
    title1: 'หาเพื่อน', title2: 'ของคุณ', title3: '\nตอนนี้เลย',
    sub: 'กรอกอีเมล — เราจะส่งรหัสให้',
    emailPh: 'your@email.com', send: 'ส่งรหัส',
    checkTitle1: 'เช็ค', checkTitle2: 'อีเมล',
    checkSub: 'เราส่งรหัสไปที่', verify: 'ยืนยัน',
    back: '← ใช้อีเมลอื่น',
    errEmail: 'กรอกอีเมลให้ถูกต้อง', errCode: 'กรอกรหัส', errNet: 'เครือข่ายขัดข้อง ลองใหม่',
  },
};

export default function LoginScreen() {
  const [lang, setLang] = useState<Lang>('EN');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const t = T[lang];

  useEffect(() => {
    AsyncStorage.getItem('lang').then(v => { if (v === 'RU' || v === 'TH' || v === 'EN') setLang(v); });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/feed');
      else setChecking(false);
    });
  }, []);

  const pickLang = (l: Lang) => { setLang(l); AsyncStorage.setItem('lang', l); };

  useFocusEffect(useCallback(() => { setStep('email'); setCode(''); setError(''); }, []));

  const sendCode = async () => {
    if (!email.includes('@')) { setError(t.errEmail); return; }
    setLoading(true); setError('');
    try {
      await supabase.auth.signOut({ scope: 'global' });
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else setStep('code');
    } catch (e) { setError(t.errNet); }
    finally { setLoading(false); }
  };

  const verifyCode = async (value?: string) => {
    const otp = (value ?? code).trim();
    if (otp.length < 6) { setError(t.errCode); return; }
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
      if (error) { setError(error.message); return; }
      if (data.session) await supabase.auth.setSession(data.session);
      router.replace('/feed');
    } catch (e) { setError(t.errNet); }
    finally { setLoading(false); }
  };

  // Auto-submit once all 6 digits are entered.
  useEffect(() => {
    if (step === 'code' && code.length === 6 && !loading) { verifyCode(code); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  if (checking) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#2FB6A8" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.langRow}>
        {LANGS.map(l => (
          <TouchableOpacity key={l} style={[styles.langBtn, lang === l && styles.langBtnOn]} onPress={() => pickLang(l)}>
            <Text style={[styles.langTxt, lang === l && styles.langTxtOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.content}>
        <Text style={styles.logo}>joiny<Text style={styles.dot}>.</Text></Text>

        {step === 'email' ? (
          <>
            <Text style={styles.title}>{t.title1} <Text style={styles.yellow}>{t.title2}</Text>{t.title3}</Text>
            <Text style={styles.sub}>{t.sub}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.emailPh}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={email}
              onChangeText={v => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={[styles.btn, (!email || loading) && styles.btnOff]} disabled={!email || loading} onPress={sendCode}>
              {loading ? <ActivityIndicator color="#16263F" /> : <Text style={styles.btnTxt}>{t.send}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>{t.checkTitle1} <Text style={styles.yellow}>{t.checkTitle2}</Text></Text>
            <Text style={styles.sub}>{t.checkSub} {email}</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={code}
              onChangeText={v => { setCode(v.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
              keyboardType="number-pad"
              maxLength={6}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={[styles.btn, (code.length < 6 || loading) && styles.btnOff]} disabled={code.length < 6 || loading} onPress={() => verifyCode()}>
              {loading ? <ActivityIndicator color="#16263F" /> : <Text style={styles.btnTxt}>{t.verify}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('email'); setCode(''); setError(''); }}>
              <Text style={styles.back}>{t.back}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16263F' },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 56, paddingHorizontal: 20 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  langBtnOn: { backgroundColor: '#2FB6A8', borderColor: '#2FB6A8' },
  langTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  langTxtOn: { color: '#16263F' },
  content: { flex: 1, padding: 28, justifyContent: 'center' },
  logo: { fontSize: 48, fontWeight: '800', color: '#fff', marginBottom: 24 },
  dot: { color: '#2FB6A8' },
  title: { fontSize: 38, fontWeight: '800', color: '#fff', lineHeight: 46, marginBottom: 12 },
  yellow: { color: '#2FB6A8' },
  sub: { fontSize: 15, color: 'rgba(255,255,255,0.45)', marginBottom: 32 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 16, fontSize: 16, color: '#fff', marginBottom: 12 },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12, marginTop: -4 },
  btn: { backgroundColor: '#2FB6A8', padding: 16, borderRadius: 14, alignItems: 'center' },
  btnOff: { opacity: 0.4 },
  btnTxt: { fontSize: 16, fontWeight: '700', color: '#16263F' },
  back: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', marginTop: 18 },
});
