/**
 * Multilingual Emergency Presets (BLUEPRINT.md Section 14.2)
 * Rapid one-tap emergency message presets in English, Hindi, and Marathi.
 */

export interface EmergencyPreset {
  id: string;
  category: 'medical' | 'supplies' | 'hazard' | 'rescue' | 'status';
  icon: string;
  en: string;
  mr: string; // Marathi
  hi: string; // Hindi
}

export const EMERGENCY_PRESETS: EmergencyPreset[] = [
  {
    id: 'med-urgent',
    category: 'medical',
    icon: '🏥',
    en: 'URGENT: Critical medical aid & first-aid kit required immediately.',
    mr: 'तात्काळ: गंभीर वैद्यकीय मदत आणि प्रथमोपचार पेटीची त्वरित गरज आहे.',
    hi: 'अत्यावश्यक: गंभीर चिकित्सा सहायता और प्राथमिक उपचार किट तुरंत चाहिए।',
  },
  {
    id: 'supplies-water',
    category: 'supplies',
    icon: '💧',
    en: 'Water & essential food rations exhausted at our shelter.',
    mr: 'आमच्या निवाऱ्यात पिण्याचे पाणी आणि अन्नधान्य संपले आहे.',
    hi: 'हमारे आश्रय स्थल पर पीने का पानी और राशन समाप्त हो गया है।',
  },
  {
    id: 'hazard-blocked',
    category: 'hazard',
    icon: '⚠️',
    en: 'Access road/bridge blocked by flood waters / fallen debris.',
    mr: 'पूर किंवा ढिगाऱ्यामुळे मुख्य रस्ता / पूल पूर्णपणे बंद झाला आहे.',
    hi: 'बाढ़ या मलबे के कारण मुख्य सड़क / पुल पूरी तरह से बंद हो गया है।',
  },
  {
    id: 'rescue-trapped',
    category: 'rescue',
    icon: '🆘',
    en: 'Civilians trapped under building debris / rising flood water.',
    mr: 'इमारतीच्या ढिगाऱ्याखाली / वाढत्या पाण्यात लोक अडकले आहेत. तातडीने मदत पाठवा.',
    hi: 'मलबे के नीचे / बढ़ते पानी में लोग फंसे हैं। तत्काल बचाव दल भेजें।',
  },
  {
    id: 'status-safe',
    category: 'status',
    icon: '✅',
    en: 'All family & group members are safe and accounted for at this location.',
    mr: 'या ठिकाणी सर्व कुटुंबीय व गट सदस्य सुरक्षित आणि सुखरूप आहेत.',
    hi: 'इस स्थान पर परिवार और समूह के सभी सदस्य सुरक्षित और सकुशल हैं।',
  },
];
