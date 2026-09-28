import type { Patient } from "@/lib/types";

/**
 * Today's appointment queue at a family practice in Hyderabad.
 * The roster only holds display info. Every clinical fact lives in Hindsight.
 * All people and records here are synthetic.
 */
export const PATIENTS: Patient[] = [
  {
    id: "P001",
    name: "Ravi Kumar Reddy",
    age: 58,
    sex: "M",
    tagline: "Hypertension · 4th visit this year",
    todayComplaint: "Dry cough again, now more than 3 months. Keeps him up at night. Asking for a stronger antibiotic.",
    slot: "10:00",
  },
  {
    id: "P002",
    name: "Meera Sharma",
    age: 34,
    sex: "F",
    tagline: "Migraine follow-up",
    todayComplaint: "Headaches getting frequent again, about 3 a week. Wants to go back on the stronger tablet.",
    slot: "10:15",
  },
  {
    id: "P003",
    name: "Suresh Naidu",
    age: 62,
    sex: "M",
    tagline: "Type 2 diabetes review",
    todayComplaint: "Routine sugar review. Feels tired most afternoons. New HbA1c report 8.4.",
    slot: "10:30",
  },
  {
    id: "P004",
    name: "Fatima Begum",
    age: 45,
    sex: "F",
    tagline: "Recurrent urinary infections",
    todayComplaint: "Burning while passing urine for 2 days, going frequently. Says it feels like last time.",
    slot: "10:45",
  },
  {
    id: "P005",
    name: "Arjun Mehta",
    age: 29,
    sex: "M",
    tagline: "Lower back pain, desk job",
    todayComplaint: "Lower back pain flared up again this week. Wants a painkiller injection so he can work.",
    slot: "11:00",
  },
  {
    id: "P006",
    name: "Lakshmi Iyer",
    age: 71,
    sex: "F",
    tagline: "Atrial fibrillation · knee osteoarthritis",
    todayComplaint: "Knee pain worse after the rains. A neighbour told her to take ibuprofen, she wants to know if it's fine.",
    slot: "11:15",
  },
  {
    id: "P007",
    name: "Mohammed Irfan",
    age: 51,
    sex: "M",
    tagline: "Acid reflux",
    todayComplaint: "Acidity and chest burning back after he stopped the gastric tablet last month.",
    slot: "11:30",
  },
  {
    id: "P008",
    name: "Priya Nair",
    age: 38,
    sex: "F",
    tagline: "New patient",
    todayComplaint: "Tiredness and hair fall for 2 months. First visit to this clinic.",
    slot: "11:45",
  },
];

export function getPatient(id: string): Patient | undefined {
  return PATIENTS.find((p) => p.id === id);
}
