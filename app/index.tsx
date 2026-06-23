import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LANGS, useI18n } from './lib/i18n';
import { supabase } from './lib/supabase';
import { colors, font, gradients, radius, shadow } from './lib/theme';

// Brand mark: a teal→blue rounded "pin" with a white J and two little "heads".
function LogoMark() {
  return (
    <View style={styles.logoMark}>
      <View style={styles.heads}>
        <LinearGradient colors={gradients.brand} style={styles.head} />
        <LinearGradient colors={gradients.brand} style={styles.head} />
      </View>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoBody}>
        <Text style={styles.logoJ}>J</Text>
      </LinearGradient>
    </View>
  );
}

export default function LoginScreen() {
  const { lang, setLang, t } = useI18n();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/feed');
      else setChecking(false);
    });
  }, []);

  const pickLang = (l: typeof lang) => { setLang(l); AsyncStorage.setItem('lang', l); };

  useFocusEffect(useCallback(() => { setStep('email'); setCode(''); setError(''); }, []));

  const sendCode = async () => {
    if (!email.includes('@')) { setError(t('login.errEmail')); return; }
    setLoading(true); setError('');
    try {
      await supabase.auth.signOut({ scope: 'global' });
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else setStep('code');
    } catch (e) { setError(t('login.errNet')); }
    finally { setLoading(false); }
  };

  const verifying = useRef(false);
  const verifyCode = async () => {
    const otp = code.trim();
    if (otp.length < 6) { setError(t('login.errCode')); return; }
    if (verifying.current) return; // never submit the same one-time code twice
    verifying.current = true;
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
      if (error) { setError(error.message); return; }
      if (data.session) await supabase.auth.setSession(data.session);
      router.replace('/feed');
    } catch (e) { setError(t('login.errNet')); }
    finally { setLoading(false); verifying.current = false; }
  };

  if (checking) {
    return (
      <LinearGradient colors={gradients.navy} style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.brandTeal} />
      </LinearGradient>
    );
  }

  const disabled = step === 'email' ? (!email || loading) : (code.length < 6 || loading);
  const onSubmit = step === 'email' ? sendCode : verifyCode;

  return (
    <LinearGradient colors={gradients.navy} style={styles.container}>
      {/* soft teal glow */}
      <View style={styles.glow} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.langRow}>
          {LANGS.map(l => (
            <TouchableOpacity key={l} style={[styles.langBtn, lang === l && styles.langBtnOn]} onPress={() => pickLang(l)}>
              <Text style={[styles.langTxt, lang === l && styles.langTxtOn]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.content}>
          <View style={styles.brandRow}>
            <LogoMark />
            <Text style={styles.wordmark}>joiny</Text>
          </View>

          {step === 'email' ? (
            <>
              <Text style={styles.title}>{t('login.title1')} <Text style={styles.accent}>{t('login.title2')}</Text>{t('login.title3')}</Text>
              <Text style={styles.sub}>{t('login.sub')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('login.emailPh')}
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>{t('login.checkTitle1')} <Text style={styles.accent}>{t('login.checkTitle2')}</Text></Text>
              <Text style={styles.sub}>{t('login.checkSub', { email })}</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={code}
                onChangeText={v => { setCode(v.replace(/[^0-9]/g, '')); setError(''); }}
                keyboardType="number-pad"
                maxLength={10}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity activeOpacity={0.9} disabled={disabled} onPress={onSubmit} style={[styles.ctaWrap, disabled && styles.ctaOff]}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>{step === 'email' ? t('login.send') : t('login.verify')}</Text>}
            </LinearGradient>
          </TouchableOpacity>

          {step === 'code' && (
            <TouchableOpacity onPress={() => { setStep('email'); setCode(''); setError(''); }}>
              <Text style={styles.back}>{t('login.back')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glow: { position: 'absolute', top: -120, alignSelf: 'center', width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(70,208,194,0.16)' },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 56, paddingHorizontal: 20 },
  langBtn: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)' },
  langBtnOn: { backgroundColor: colors.brandTeal, borderColor: colors.brandTeal },
  langTxt: { fontSize: 12, fontFamily: font.bold, color: 'rgba(255,255,255,0.6)' },
  langTxtOn: { color: '#0E2138' },
  content: { flex: 1, padding: 28, justifyContent: 'center' },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  logoMark: { width: 60, alignItems: 'center' },
  heads: { flexDirection: 'row', gap: 6, marginBottom: -6, zIndex: 2 },
  head: { width: 17, height: 17, borderRadius: 9 },
  logoBody: { width: 56, height: 56, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomRightRadius: 28, borderBottomLeftRadius: 10, alignItems: 'center', justifyContent: 'center', ...shadow.cta },
  logoJ: { fontFamily: font.heading, fontSize: 34, color: '#fff', marginTop: -2 },
  wordmark: { fontFamily: font.heading, fontSize: 42, color: '#fff' },

  title: { fontFamily: font.heading, fontSize: 34, color: '#fff', lineHeight: 42, marginBottom: 12 },
  accent: { color: colors.brandTeal },
  sub: { fontFamily: font.medium, fontSize: 15, color: 'rgba(255,255,255,0.55)', marginBottom: 30 },
  input: { backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: 16, fontSize: 16, fontFamily: font.semibold, color: '#fff' },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontFamily: font.extrabold },
  error: { color: '#FF9AA2', fontFamily: font.semibold, fontSize: 13, marginTop: 10 },
  ctaWrap: { marginTop: 18, borderRadius: radius.cta, ...shadow.cta },
  ctaOff: { opacity: 0.45 },
  cta: { padding: 17, borderRadius: radius.cta, alignItems: 'center' },
  ctaTxt: { fontSize: 16, fontFamily: font.extrabold, color: '#fff' },
  back: { color: 'rgba(255,255,255,0.5)', fontFamily: font.semibold, fontSize: 14, textAlign: 'center', marginTop: 18 },
});
