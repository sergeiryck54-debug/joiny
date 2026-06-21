import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'EN' | 'RU' | 'TH';
export const LANGS: Lang[] = ['EN', 'RU', 'TH'];

// key -> { EN, RU, TH }
const TR: Record<string, Record<Lang, string>> = {
  // ---- common ----
  'common.cancel': { EN: 'Cancel', RU: 'Отмена', TH: 'ยกเลิก' },
  'common.delete': { EN: 'Delete', RU: 'Удалить', TH: 'ลบ' },
  'common.save': { EN: 'Save', RU: 'Сохранить', TH: 'บันทึก' },
  'common.back': { EN: '← Back', RU: '← Назад', TH: '← กลับ' },
  'common.tryAgain': { EN: 'Try again.', RU: 'Попробуй ещё раз.', TH: 'ลองอีกครั้ง' },
  'common.failed': { EN: 'Something went wrong', RU: 'Не удалось', TH: 'เกิดข้อผิดพลาด' },
  'common.now': { EN: '🟢 Now', RU: '🟢 Сейчас', TH: '🟢 ตอนนี้' },
  'common.later': { EN: '🕐 Later', RU: '🕐 Позже', TH: '🕐 ภายหลัง' },
  'common.anon': { EN: 'Anonymous', RU: 'Аноним', TH: 'ผู้ไม่ระบุชื่อ' },
  'common.uploading': { EN: 'Uploading…', RU: 'Загрузка…', TH: 'กำลังอัปโหลด…' },

  // ---- tabs ----
  'tab.map': { EN: 'Map', RU: 'Карта', TH: 'แผนที่' },
  'tab.create': { EN: 'Create', RU: 'Создать', TH: 'สร้าง' },
  'tab.feed': { EN: 'Feed', RU: 'Лента', TH: 'ฟีด' },
  'tab.me': { EN: 'Me', RU: 'Я', TH: 'ฉัน' },
  'tab.alerts': { EN: 'Alerts', RU: 'Уведомл.', TH: 'แจ้งเตือน' },

  // ---- login ----
  'login.title1': { EN: 'Find your', RU: 'Найди своих', TH: 'หาเพื่อน' },
  'login.title2': { EN: 'people', RU: 'людей', TH: 'ของคุณ' },
  'login.title3': { EN: ',\nright now', RU: '\nпрямо сейчас', TH: '\nตอนนี้เลย' },
  'login.sub': { EN: "Enter your email — we'll send a code", RU: 'Введи email — пришлём код', TH: 'กรอกอีเมล — เราจะส่งรหัสให้' },
  'login.emailPh': { EN: 'your@email.com', RU: 'твой@email.com', TH: 'your@email.com' },
  'login.send': { EN: 'Send code', RU: 'Получить код', TH: 'ส่งรหัส' },
  'login.checkTitle1': { EN: 'Check your', RU: 'Проверь свою', TH: 'เช็ค' },
  'login.checkTitle2': { EN: 'email', RU: 'почту', TH: 'อีเมล' },
  'login.checkSub': { EN: 'We sent a code to {email}', RU: 'Мы отправили код на {email}', TH: 'เราส่งรหัสไปที่ {email}' },
  'login.verify': { EN: 'Verify & Enter', RU: 'Подтвердить', TH: 'ยืนยัน' },
  'login.back': { EN: '← Use a different email', RU: '← Другой email', TH: '← ใช้อีเมลอื่น' },
  'login.errEmail': { EN: 'Enter a valid email', RU: 'Введи корректный email', TH: 'กรอกอีเมลให้ถูกต้อง' },
  'login.errCode': { EN: 'Enter the code', RU: 'Введи код', TH: 'กรอกรหัส' },
  'login.errNet': { EN: 'Network error. Try again.', RU: 'Ошибка сети. Попробуй ещё.', TH: 'เครือข่ายขัดข้อง ลองใหม่' },

  // ---- map / explore ----
  'map.all': { EN: 'All', RU: 'Все', TH: 'ทั้งหมด' },
  'map.now': { EN: 'Now', RU: 'Сейчас', TH: 'ตอนนี้' },
  'map.nearby': { EN: 'Nearby', RU: 'Рядом', TH: 'ใกล้ ๆ' },
  'map.people': { EN: 'People', RU: 'Людей', TH: 'คน' },
  'map.join': { EN: 'Join', RU: 'Вступить', TH: 'เข้าร่วม' },
  'map.createEvent': { EN: '✦ Create Event', RU: '✦ Создать событие', TH: '✦ สร้างกิจกรรม' },
  'map.cancelPick': { EN: '✕ Cancel — pick a point', RU: '✕ Отмена — выбери точку', TH: '✕ ยกเลิก — เลือกจุด' },
  'map.tapHint': { EN: '👆 Tap the map to place the event', RU: '👆 Нажми на карту, чтобы поставить событие', TH: '👆 แตะแผนที่เพื่อวางกิจกรรม' },
  'map.finding': { EN: 'Finding your location...', RU: 'Определяем геолокацию...', TH: 'กำลังค้นหาตำแหน่ง...' },
  'map.full': { EN: 'Event is full', RU: 'Событие заполнено', TH: 'กิจกรรมเต็มแล้ว' },
  'map.fullMsg': { EN: 'All spots are taken.', RU: 'Все места уже заняты.', TH: 'ที่นั่งเต็มแล้ว' },
  'map.delQ': { EN: 'Delete event?', RU: 'Удалить событие?', TH: 'ลบกิจกรรม?' },
  'map.delMsg': { EN: 'The event and its chat will be deleted for everyone. This cannot be undone.', RU: 'Событие и его чат удалятся для всех. Это необратимо.', TH: 'กิจกรรมและแชทจะถูกลบสำหรับทุกคน ไม่สามารถย้อนกลับได้' },
  'map.delFail': { EN: "Couldn't delete", RU: 'Не удалось удалить', TH: 'ลบไม่สำเร็จ' },

  // ---- create ----
  'create.header': { EN: 'New Event', RU: 'Новое событие', TH: 'กิจกรรมใหม่' },
  'create.headerSub': { EN: "Tell people what you're up to", RU: 'Расскажи, что планируешь', TH: 'บอกเพื่อน ๆ ว่าคุณจะทำอะไร' },
  'create.rightNow': { EN: '⚡ Right Now', RU: '⚡ Сейчас', TH: '⚡ ตอนนี้' },
  'create.planAhead': { EN: '📅 Plan Ahead', RU: '📅 Заранее', TH: '📅 วางแผน' },
  'create.eventName': { EN: 'EVENT NAME', RU: 'НАЗВАНИЕ', TH: 'ชื่อกิจกรรม' },
  'create.eventNamePh': { EN: 'e.g. Football in the park...', RU: 'напр. Футбол в парке...', TH: 'เช่น ฟุตบอลในสวน...' },
  'create.category': { EN: 'CATEGORY', RU: 'КАТЕГОРИЯ', TH: 'หมวดหมู่' },
  'create.location': { EN: 'LOCATION', RU: 'МЕСТО', TH: 'สถานที่' },
  'create.addressPh': { EN: '📍 Address (or tap the map)', RU: '📍 Адрес (или поставь точку на карте)', TH: '📍 ที่อยู่ (หรือแตะแผนที่)' },
  'create.tapMapHint': { EN: 'Tap the map to place the event point', RU: 'Нажми на карту, чтобы поставить точку события', TH: 'แตะแผนที่เพื่อวางจุดกิจกรรม' },
  'create.resolving': { EN: 'Resolving address…', RU: 'Определяем адрес…', TH: 'กำลังหาที่อยู่…' },
  'create.pointChosen': { EN: '📍 Point chosen — event will be placed here', RU: '📍 Точка выбрана — событие закрепится здесь', TH: '📍 เลือกจุดแล้ว — กิจกรรมจะอยู่ที่นี่' },
  'create.photos': { EN: 'PHOTOS', RU: 'ФОТО', TH: 'รูปภาพ' },
  'create.maxPeople': { EN: 'MAX PEOPLE', RU: 'МАКС. ЛЮДЕЙ', TH: 'จำนวนสูงสุด' },
  'create.dateTime': { EN: 'DATE & TIME', RU: 'ДАТА И ВРЕМЯ', TH: 'วันและเวลา' },
  'create.dateTimePh': { EN: 'e.g. Tomorrow at 18:00', RU: 'напр. Завтра в 18:00', TH: 'เช่น พรุ่งนี้ 18:00' },
  'create.publish': { EN: '✦ Publish Event', RU: '✦ Опубликовать', TH: '✦ เผยแพร่กิจกรรม' },
  'create.doneTitle': { EN: 'Event Created!', RU: 'Событие создано!', TH: 'สร้างกิจกรรมแล้ว!' },
  'create.doneSub': { EN: 'People nearby will see your event on the map right now', RU: 'Люди рядом увидят твоё событие на карте прямо сейчас', TH: 'คนใกล้เคียงจะเห็นกิจกรรมของคุณบนแผนที่ทันที' },
  'create.another': { EN: 'Create Another →', RU: 'Создать ещё →', TH: 'สร้างอีก →' },
  'cat.Sport': { EN: 'Sport', RU: 'Спорт', TH: 'กีฬา' },
  'cat.Music': { EN: 'Music', RU: 'Музыка', TH: 'ดนตรี' },
  'cat.Food': { EN: 'Food', RU: 'Еда', TH: 'อาหาร' },
  'cat.Games': { EN: 'Games', RU: 'Игры', TH: 'เกม' },
  'cat.Health': { EN: 'Health', RU: 'Здоровье', TH: 'สุขภาพ' },
  'cat.Photo': { EN: 'Photo', RU: 'Фото', TH: 'ถ่ายรูป' },
  'cat.Pets': { EN: 'Pets', RU: 'Питомцы', TH: 'สัตว์เลี้ยง' },
  'cat.Books': { EN: 'Books', RU: 'Книги', TH: 'หนังสือ' },

  // ---- feed ----
  'feed.title': { EN: 'Feed', RU: 'Лента', TH: 'ฟีด' },
  'feed.sub': { EN: 'Friends and community activity', RU: 'Друзья и активность сообщества', TH: 'เพื่อนและกิจกรรมในชุมชน' },
  'feed.composerPh': { EN: "What's happening?", RU: 'Что происходит?', TH: 'มีอะไรเกิดขึ้นบ้าง?' },
  'feed.post': { EN: 'Post', RU: 'Опубликовать', TH: 'โพสต์' },
  'feed.friend': { EN: '★ Friend', RU: '★ Друг', TH: '★ เพื่อน' },
  'feed.eventTag': { EN: '📅 event', RU: '📅 событие', TH: '📅 กิจกรรม' },
  'feed.open': { EN: 'Open event →', RU: 'Открыть событие →', TH: 'เปิดกิจกรรม →' },
  'feed.empty': { EN: 'Empty yet — add friends or create an event!', RU: 'Пока пусто — добавь друзей или создай событие!', TH: 'ยังว่างอยู่ — เพิ่มเพื่อนหรือสร้างกิจกรรม!' },

  // ---- profile ----
  'profile.setName': { EN: 'Set your name', RU: 'Укажи имя', TH: 'ตั้งชื่อของคุณ' },
  'profile.addBio': { EN: 'Add a short bio', RU: 'Добавь описание', TH: 'เพิ่มประวัติสั้น ๆ' },
  'profile.yourCity': { EN: 'Your city', RU: 'Твой город', TH: 'เมืองของคุณ' },
  'profile.edit': { EN: '✏ Edit Profile', RU: '✏ Изменить профиль', TH: '✏ แก้ไขโปรไฟล์' },
  'profile.namePh': { EN: 'Your name', RU: 'Имя', TH: 'ชื่อของคุณ' },
  'profile.bioPh': { EN: 'Bio', RU: 'Описание', TH: 'ประวัติ' },
  'profile.cityPh': { EN: 'City', RU: 'Город', TH: 'เมือง' },
  'profile.statEvents': { EN: 'Events', RU: 'События', TH: 'กิจกรรม' },
  'profile.statJoined': { EN: 'Joined', RU: 'Участие', TH: 'เข้าร่วม' },
  'profile.statFriends': { EN: 'Friends', RU: 'Друзья', TH: 'เพื่อน' },
  'profile.myEvents': { EN: 'My Events', RU: 'Мои события', TH: 'กิจกรรมของฉัน' },
  'profile.joinedTitle': { EN: 'Joined', RU: 'Участвую', TH: 'ที่เข้าร่วม' },
  'profile.friendsTitle': { EN: 'Friends', RU: 'Друзья', TH: 'เพื่อน' },
  'profile.requests': { EN: 'Friend requests ({n})', RU: 'Заявки в друзья ({n})', TH: 'คำขอเป็นเพื่อน ({n})' },
  'profile.wantsFriend': { EN: 'wants to be your friend', RU: 'хочет добавить тебя в друзья', TH: 'อยากเป็นเพื่อนกับคุณ' },
  'profile.interests': { EN: 'My Interests', RU: 'Мои интересы', TH: 'ความสนใจของฉัน' },
  'profile.saveInterests': { EN: 'Save interests', RU: 'Сохранить интересы', TH: 'บันทึกความสนใจ' },
  'profile.saving': { EN: 'Saving...', RU: 'Сохраняю...', TH: 'กำลังบันทึก...' },
  'profile.signOut': { EN: 'Sign Out', RU: 'Выйти', TH: 'ออกจากระบบ' },
  'profile.noEvents': { EN: 'No events yet — create the first one!', RU: 'Нет своих событий — создай первое!', TH: 'ยังไม่มีกิจกรรม — สร้างอันแรกเลย!' },
  'profile.noJoined': { EN: "You haven't joined anything yet", RU: 'Ты пока никуда не вступил', TH: 'คุณยังไม่ได้เข้าร่วมอะไรเลย' },
  'profile.noFriends': { EN: 'No friends yet', RU: 'Пока нет друзей', TH: 'ยังไม่มีเพื่อน' },
  'profile.changePhoto': { EN: 'Change photo', RU: 'Сменить фото', TH: 'เปลี่ยนรูป' },
  'profile.addPhoto': { EN: 'Add photo', RU: 'Добавить фото', TH: 'เพิ่มรูป' },
  'profile.uploadFail': { EN: "Couldn't upload", RU: 'Не удалось загрузить', TH: 'อัปโหลดไม่สำเร็จ' },

  // ---- notifications ----
  'notif.title': { EN: 'Notifications', RU: 'Уведомления', TH: 'การแจ้งเตือน' },
  'notif.all': { EN: 'All', RU: 'Все', TH: 'ทั้งหมด' },
  'notif.events': { EN: 'Events', RU: 'События', TH: 'กิจกรรม' },
  'notif.posts': { EN: 'Posts', RU: 'Посты', TH: 'โพสต์' },
  'notif.open': { EN: 'Open event →', RU: 'Открыть событие →', TH: 'เปิดกิจกรรม →' },
  'notif.del': { EN: '🗑 Delete', RU: '🗑 Удалить', TH: '🗑 ลบ' },
  'notif.emptyTitle': { EN: 'Nothing yet', RU: 'Пока пусто', TH: 'ยังไม่มีอะไร' },
  'notif.emptySub': { EN: 'Activity will appear here', RU: 'Активность появится здесь', TH: 'กิจกรรมจะปรากฏที่นี่' },
  'notif.newEvent': { EN: 'New event nearby — "{title}" · {people}/{max} people', RU: 'Новое событие рядом — «{title}» · {people}/{max} человек', TH: 'กิจกรรมใหม่ใกล้คุณ — "{title}" · {people}/{max} คน' },
  'notif.posted': { EN: '{user} posted: "{text}"', RU: '{user} опубликовал: «{text}»', TH: '{user} โพสต์: "{text}"' },
  'time.now': { EN: 'just now', RU: 'только что', TH: 'เมื่อสักครู่' },
  'time.min': { EN: '{n} min ago', RU: '{n} мин назад', TH: '{n} นาทีที่แล้ว' },
  'time.hour': { EN: '{n}h ago', RU: '{n} ч назад', TH: '{n} ชม.ที่แล้ว' },
  'time.day': { EN: '{n}d ago', RU: '{n} дн назад', TH: '{n} วันที่แล้ว' },

  // ---- event detail ----
  'ev.organizer': { EN: 'Organizer', RU: 'Организатор', TH: 'ผู้จัด' },
  'ev.participants': { EN: 'participants', RU: 'участников', TH: 'ผู้เข้าร่วม' },
  'ev.like': { EN: 'Like', RU: 'Нравится', TH: 'ถูกใจ' },
  'ev.liked': { EN: 'You like this', RU: 'Вам нравится', TH: 'คุณถูกใจสิ่งนี้' },
  'ev.rightNow': { EN: '🟢 Right now', RU: '🟢 Прямо сейчас', TH: '🟢 ตอนนี้เลย' },
  'ev.noTime': { EN: 'Time not set', RU: 'Время не указано', TH: 'ยังไม่ได้ระบุเวลา' },
  'ev.join': { EN: 'Join', RU: 'Присоединиться', TH: 'เข้าร่วม' },
  'ev.leave': { EN: "✓ You're in — leave", RU: '✓ Вы участвуете — выйти', TH: '✓ คุณเข้าร่วมแล้ว — ออก' },
  'ev.openChat': { EN: '💬 Open event chat', RU: '💬 Открыть чат события', TH: '💬 เปิดแชทกิจกรรม' },
  'ev.share': { EN: '🔗 Share link', RU: '🔗 Поделиться ссылкой', TH: '🔗 แชร์ลิงก์' },
  'ev.edit': { EN: '✏ Edit event', RU: '✏ Редактировать событие', TH: '✏ แก้ไขกิจกรรม' },
  'ev.del': { EN: '🗑 Delete event', RU: '🗑 Удалить событие', TH: '🗑 ลบกิจกรรม' },
  'ev.notFound': { EN: 'Event not found', RU: 'Событие не найдено', TH: 'ไม่พบกิจกรรม' },
  'ev.joinFirst': { EN: 'Join first', RU: 'Сначала присоединись', TH: 'เข้าร่วมก่อน' },
  'ev.joinFirstMsg': { EN: 'The chat is for participants.', RU: 'Чат доступен участникам события.', TH: 'แชทสำหรับผู้เข้าร่วมเท่านั้น' },
  'ev.addPhoto': { EN: '📷 Add event photo', RU: '📷 Добавить фото события', TH: '📷 เพิ่มรูปกิจกรรม' },
  'ev.photosCount': { EN: '{n} photos', RU: '{n} фото', TH: '{n} รูป' },
  'ev.delPhotoQ': { EN: 'Delete photo?', RU: 'Удалить фото?', TH: 'ลบรูป?' },
  'ev.delPhotoMsg': { EN: 'This photo will be deleted.', RU: 'Это фото будет удалено.', TH: 'รูปนี้จะถูกลบ' },
  'ev.photoFail': { EN: "Couldn't update photo", RU: 'Не удалось обновить фото', TH: 'อัปเดตรูปไม่สำเร็จ' },
  'ev.reportTitle': { EN: 'Report photo', RU: 'Пожаловаться на фото', TH: 'รายงานรูป' },
  'ev.reportSub': { EN: 'Choose a reason', RU: 'Выбери причину', TH: 'เลือกเหตุผล' },
  'ev.rOffensive': { EN: 'Offensive', RU: 'Оскорбительное', TH: 'ไม่เหมาะสม' },
  'ev.rSpam': { EN: 'Spam / ads', RU: 'Спам/реклама', TH: 'สแปม/โฆษณา' },
  'ev.rOther': { EN: 'Other', RU: 'Другое', TH: 'อื่น ๆ' },
  'ev.reportThanks': { EN: 'Thanks', RU: 'Спасибо', TH: 'ขอบคุณ' },
  'ev.reportThanksMsg': { EN: 'Your report was sent for review.', RU: 'Жалоба отправлена на проверку.', TH: 'ส่งรายงานเพื่อตรวจสอบแล้ว' },
  'ev.reportFail': { EN: "Couldn't send", RU: 'Не удалось отправить', TH: 'ส่งไม่สำเร็จ' },
  'ev.shareOpen': { EN: 'Open in Joiny: ', RU: 'Открой в Joiny: ', TH: 'เปิดใน Joiny: ' },

  // ---- chat ----
  'chat.sub': { EN: 'Event chat · participants only', RU: 'Чат события · только участники', TH: 'แชทกิจกรรม · เฉพาะผู้เข้าร่วม' },
  'chat.ph': { EN: 'Message…', RU: 'Сообщение…', TH: 'ข้อความ…' },
  'chat.empty': { EN: 'No messages yet — say hi 👋', RU: 'Сообщений пока нет — поздоровайся 👋', TH: 'ยังไม่มีข้อความ — ทักทายกันเลย 👋' },

  // ---- user profile ----
  'user.interests': { EN: 'Interests', RU: 'Интересы', TH: 'ความสนใจ' },
  'user.events': { EN: 'Events', RU: 'События', TH: 'กิจกรรม' },
  'user.noEvents': { EN: 'No events yet', RU: 'Пока нет событий', TH: 'ยังไม่มีกิจกรรม' },
  'user.addFriend': { EN: '+ Add friend', RU: '+ Добавить в друзья', TH: '+ เพิ่มเพื่อน' },
  'user.requested': { EN: '⏳ Request sent', RU: '⏳ Заявка отправлена', TH: '⏳ ส่งคำขอแล้ว' },
  'user.accept': { EN: '✓ Accept request', RU: '✓ Принять заявку', TH: '✓ ตอบรับคำขอ' },
  'user.friends': { EN: '✓ Friends', RU: '✓ В друзьях', TH: '✓ เป็นเพื่อนแล้ว' },

  // ---- edit ----
  'edit.header': { EN: 'Edit event', RU: 'Редактировать событие', TH: 'แก้ไขกิจกรรม' },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string, params?: Record<string, any>) => string };
const I18nContext = createContext<Ctx>({ lang: 'EN', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('EN');

  useEffect(() => {
    AsyncStorage.getItem('lang').then(v => { if (v === 'EN' || v === 'RU' || v === 'TH') setLangState(v); });
  }, []);

  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem('lang', l); };

  const t = (k: string, params?: Record<string, any>) => {
    let s = TR[k]?.[lang] ?? TR[k]?.EN ?? k;
    if (params) for (const p in params) s = s.split(`{${p}}`).join(String(params[p]));
    return s;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
