/**
 * Synthetic but clinically realistic history for the demo practice.
 * PATIENT_HISTORY goes into the patient bank (tagged per patient).
 * CLINIC_CASES goes into the clinic bank (anonymised, no names).
 * None of this is real patient data.
 */

export interface SeedEntry {
  date: string; // YYYY-MM-DD
  text: string;
  context: string;
}

export const PATIENT_HISTORY: Record<string, SeedEntry[]> = {
  P001: [
    { date: "2019-03-11", context: "allergy record", text: "Ravi Kumar Reddy developed a widespread itchy rash after amoxicillin in 2019. Recorded allergy: penicillin group antibiotics. Avoid amoxicillin and co-amoxiclav." },
    { date: "2026-05-20", context: "clinic consultation note", text: "Visit on 2026-05-20. Ravi Kumar Reddy, 58M, BP 158/96 on two readings. Diagnosed with stage 2 hypertension. Started lisinopril (ACE inhibitor) once daily. Advised salt reduction and walking." },
    { date: "2026-06-24", context: "clinic consultation note", text: "Visit on 2026-06-24. Ravi Kumar Reddy presented with a dry tickly cough for about a week, no fever, no sputum. Chest clear. Thought to be viral. Given cough syrup. BP improved to 138/88 on lisinopril." },
    { date: "2026-07-15", context: "clinic consultation note", text: "Visit on 2026-07-15. Ravi Kumar Reddy's dry cough persists for 4 weeks, worse at night. No fever. Given a 3-day course of azithromycin (penicillin avoided due to allergy)." },
    { date: "2026-07-29", context: "treatment outcome follow-up", text: "Follow-up on 2026-07-29: Ravi Kumar Reddy says the azithromycin course made no difference to the dry cough." },
    { date: "2026-08-19", context: "clinic consultation note", text: "Visit on 2026-08-19. Ravi Kumar Reddy still has dry cough, now 8 weeks. Chest X-ray normal. Non-smoker. Advised steam inhalation and honey. He is frustrated that nothing is working and his wife complains the cough wakes her." },
    { date: "2026-08-19", context: "patient preference", text: "Ravi Kumar Reddy prefers once-daily tablets because he travels for work and forgets evening doses." },
  ],
  P002: [
    { date: "2025-11-04", context: "clinic consultation note", text: "Visit on 2025-11-04. Meera Sharma, 34F, software engineer, migraine without aura since college. Triggers she reports: skipped lunch, long screen hours, poor sleep. Sumatriptan at onset works well for her." },
    { date: "2026-02-10", context: "clinic consultation note", text: "Visit on 2026-02-10. Meera Sharma having 3-4 migraines a week. Started propranolol daily as preventive." },
    { date: "2026-04-02", context: "treatment outcome follow-up", text: "Follow-up on 2026-04-02: Meera Sharma stopped propranolol after 6 weeks because of heavy tiredness and cold hands. Headache frequency had not changed much." },
    { date: "2026-04-02", context: "clinic consultation note", text: "Visit on 2026-04-02. Meera Sharma started low-dose amitriptyline at night as migraine preventive instead of propranolol." },
    { date: "2026-06-18", context: "treatment outcome follow-up", text: "Follow-up on 2026-06-18: Meera Sharma on amitriptyline down to about 1 migraine a week. Mild morning drowsiness, acceptable to her." },
    { date: "2026-08-27", context: "clinic consultation note", text: "Visit on 2026-08-27. Meera Sharma mentioned she and her husband are planning a pregnancy in the next few months. Asked to review all her medicines before trying to conceive. Folic acid advised." },
  ],
  P003: [
    { date: "2024-09-12", context: "clinic consultation note", text: "Suresh Naidu, 62M, diagnosed with type 2 diabetes in September 2024. Started metformin twice daily." },
    { date: "2026-03-05", context: "lab result", text: "Lab result 2026-03-05: Suresh Naidu HbA1c 7.2 percent. Kidney function normal (eGFR 78)." },
    { date: "2026-06-11", context: "lab result", text: "Lab result 2026-06-11: Suresh Naidu HbA1c 7.9 percent, rising." },
    { date: "2026-06-11", context: "clinic consultation note", text: "Visit on 2026-06-11. Suresh Naidu admitted he often skips the evening metformin dose because it gives him loose stools and stomach upset. Counselled to take with food." },
    { date: "2026-06-11", context: "patient preference", text: "Suresh Naidu is worried about starting insulin injections and would strongly prefer tablets." },
  ],
  P004: [
    { date: "2018-06-20", context: "allergy record", text: "Fatima Begum had a severe skin rash with co-trimoxazole (sulfa antibiotic) in 2018. Recorded allergy: sulfonamides." },
    { date: "2026-01-14", context: "clinic consultation note", text: "Visit on 2026-01-14. Fatima Begum, 45F, urinary tract infection with burning and frequency. Treated with ciprofloxacin, improved." },
    { date: "2026-04-22", context: "clinic consultation note", text: "Visit on 2026-04-22. Fatima Begum second UTI this year. Ciprofloxacin again, slow response, took 7 days to settle." },
    { date: "2026-07-08", context: "lab result", text: "Urine culture 2026-07-08 for Fatima Begum, third UTI of the year: E. coli resistant to ciprofloxacin, sensitive to nitrofurantoin and fosfomycin." },
    { date: "2026-07-08", context: "clinic consultation note", text: "Visit on 2026-07-08. Fatima Begum treated with nitrofurantoin per culture. Symptoms cleared in 3 days. Discussed drinking more water; she drinks under 1 litre a day." },
  ],
  P005: [
    { date: "2026-02-03", context: "clinic consultation note", text: "Visit on 2026-02-03. Arjun Mehta, 29M, IT job, lower back pain for 2 weeks, no red flags. Given diclofenac tablets." },
    { date: "2026-02-10", context: "treatment outcome follow-up", text: "Follow-up on 2026-02-10: Arjun Mehta developed acidity and upper stomach pain on diclofenac. Stopped it. Record: NSAIDs cause him gastritis." },
    { date: "2026-02-10", context: "clinic consultation note", text: "Visit on 2026-02-10. Arjun Mehta referred to physiotherapy for core strengthening, 6 sessions." },
    { date: "2026-03-24", context: "treatment outcome follow-up", text: "Follow-up on 2026-03-24: Arjun Mehta's back pain fully settled after physiotherapy. Given a home exercise sheet." },
    { date: "2026-06-30", context: "clinic consultation note", text: "Visit on 2026-06-30. Arjun Mehta mild back pain relapse. Admits he stopped the home exercises in April. Works 10 hours a day on a laptop at home without a proper chair." },
  ],
  P006: [
    { date: "2025-10-15", context: "clinic consultation note", text: "Lakshmi Iyer, 71F, atrial fibrillation, on warfarin since October 2025 under cardiology. INR target 2 to 3." },
    { date: "2026-02-18", context: "clinic consultation note", text: "Visit on 2026-02-18. Lakshmi Iyer, bilateral knee osteoarthritis, worse on stairs. Advised paracetamol as needed, knee exercises and a walking stick." },
    { date: "2026-05-09", context: "clinic consultation note", text: "Visit on 2026-05-09. Lakshmi Iyer had gum bleeding and a large bruise on her arm. She had taken an over-the-counter painkiller containing ibuprofen for 5 days for knee pain. INR 4.6. Stopped the painkiller, cardiology informed, warfarin dose adjusted." },
    { date: "2026-06-20", context: "treatment outcome follow-up", text: "Follow-up on 2026-06-20: Lakshmi Iyer's INR back to 2.6. Topical diclofenac gel plus paracetamol keeping knee pain manageable. Physiotherapy helped her climb stairs." },
  ],
  P007: [
    { date: "2025-08-12", context: "clinic consultation note", text: "Mohammed Irfan, 51M, heartburn and acid reflux for years. Endoscopy in August 2025 was normal, no ulcer. Diagnosed GERD. Started pantoprazole before breakfast." },
    { date: "2025-12-03", context: "treatment outcome follow-up", text: "Follow-up on 2025-12-03: Mohammed Irfan symptom free on pantoprazole. Tried stopping it suddenly, symptoms came back within a week." },
    { date: "2026-04-15", context: "clinic consultation note", text: "Visit on 2026-04-15. Mohammed Irfan eats dinner late around 11pm and lies down soon after. Smokes 5 cigarettes a day. Weight up 4 kg this year." },
  ],
  P008: [],
};

export const CLINIC_CASES: SeedEntry[] = [
  // ACE inhibitor cough pattern
  { date: "2025-09-10", context: "anonymised case outcome", text: "Case outcome: 60s male with hypertension on lisinopril (ACE inhibitor) and dry cough for 10 weeks. Two antibiotic courses gave no benefit. Switched lisinopril to losartan (ARB). Cough fully resolved within 3 weeks." },
  { date: "2025-11-21", context: "anonymised case outcome", text: "Case outcome: 50s female with hypertension on enalapril (ACE inhibitor), persistent dry night cough for 2 months, chest X-ray normal. Switched to telmisartan (ARB). Cough resolved in 4 weeks, BP stayed controlled." },
  { date: "2026-01-30", context: "anonymised case outcome", text: "Case outcome: 50s male on ramipril (ACE inhibitor) with dry cough 6 weeks. Given cough syrup and antihistamine, no change. Switched to losartan. Cough gone in 2 weeks." },
  { date: "2026-03-14", context: "anonymised case outcome", text: "Case outcome: 60s female on lisinopril with dry cough 3 months, treated twice with antibiotics without benefit. Switched to an ARB. Resolved within a month." },
  { date: "2026-05-06", context: "anonymised case outcome", text: "Case outcome: 40s male on lisinopril with dry cough. Initially given azithromycin, no change. After switching to telmisartan cough resolved in 3 weeks." },
  { date: "2026-06-17", context: "anonymised case outcome", text: "Case outcome: 70s male on ramipril with dry cough. Doctor kept the ACE inhibitor and tried inhalers for 6 weeks, no change. Switched to ARB, cough settled." },

  // Migraine preventives and pregnancy planning
  { date: "2025-10-08", context: "anonymised case outcome", text: "Case outcome: 30s female with migraine planning pregnancy. Preventive medication reviewed before conception; amitriptyline tapered and stopped, managed with trigger control, regular meals, sleep routine and paracetamol for attacks. Frequency stayed acceptable." },
  { date: "2026-01-19", context: "anonymised case outcome", text: "Case outcome: 30s female with migraine on propranolol stopped it due to fatigue. Switched to amitriptyline, good reduction in attacks." },
  { date: "2026-04-25", context: "anonymised case outcome", text: "Case outcome: 20s female with frequent migraine, screen-heavy job. Structured screen breaks, hydration and fixed meal times reduced attacks by about half without extra medicine." },
  { date: "2026-07-02", context: "anonymised case outcome", text: "Case outcome: 30s female trying to conceive with migraine. Referred to gynaecology for a joint medicine review; topiramate and valproate avoided. Attacks managed without daily preventive." },

  // Metformin intolerance and adherence
  { date: "2025-12-12", context: "anonymised case outcome", text: "Case outcome: 60s male with type 2 diabetes skipping metformin doses due to diarrhoea. Switched to extended-release metformin once daily with dinner. GI upset settled, adherence improved, HbA1c fell from 8.2 to 7.1 in 3 months." },
  { date: "2026-02-27", context: "anonymised case outcome", text: "Case outcome: 50s female with type 2 diabetes and stomach upset on metformin. Extended-release metformin with food resolved symptoms. HbA1c improved by 0.9 in 3 months." },
  { date: "2026-05-15", context: "anonymised case outcome", text: "Case outcome: 60s male with rising HbA1c, tired in afternoons. Found to be missing evening doses. Once-daily extended-release metformin plus a phone reminder; HbA1c improved from 8.0 to 7.3." },
  { date: "2026-07-21", context: "anonymised case outcome", text: "Case outcome: 60s male reluctant to start insulin with HbA1c 8.5. Adherence fixed first and a second oral agent added; HbA1c reached 7.2 in 4 months without insulin." },

  // UTI resistance
  { date: "2025-10-30", context: "anonymised case outcome", text: "Case outcome: 40s female with recurrent UTI, culture showed ciprofloxacin resistance. Nitrofurantoin 5-day course cleared symptoms in 3 days." },
  { date: "2026-03-03", context: "anonymised case outcome", text: "Case outcome: 40s female, third UTI in a year, given ciprofloxacin empirically without culture. Did not improve; culture later showed resistance. Needed a second antibiotic. Lesson: send culture early for recurrent UTI." },
  { date: "2026-06-09", context: "anonymised case outcome", text: "Case outcome: 50s female with recurrent UTIs and low water intake. Increased fluids to 2.5 litres a day and post-void hygiene advice; no further UTI in 5 months." },

  // Back pain
  { date: "2025-11-11", context: "anonymised case outcome", text: "Case outcome: 20s male with desk-job lower back pain relapse. Painkiller injection gave relief for 2 days only. Restarting physiotherapy and a workstation setup (proper chair, laptop stand) resolved pain in 4 weeks." },
  { date: "2026-02-22", context: "anonymised case outcome", text: "Case outcome: 30s male with mechanical back pain and NSAID gastritis history. Managed with paracetamol, heat and physiotherapy. Avoided NSAIDs, no gastric symptoms." },
  { date: "2026-05-28", context: "anonymised case outcome", text: "Case outcome: 20s female with recurring low back pain who stopped home exercises. Restarted a 10-minute daily routine; relapses stopped over 3 months." },

  // Warfarin and painkillers
  { date: "2025-12-05", context: "anonymised case outcome", text: "Case outcome: 70s female on warfarin took ibuprofen for joint pain, INR rose to 5 with bruising. Stopped ibuprofen. Managed later with paracetamol and topical diclofenac gel without INR problems." },
  { date: "2026-04-10", context: "anonymised case outcome", text: "Case outcome: 70s male on warfarin with knee osteoarthritis. Physiotherapy plus paracetamol and topical NSAID gel controlled pain. No bleeding events over 6 months." },

  // GERD
  { date: "2026-01-08", context: "anonymised case outcome", text: "Case outcome: 50s male with GERD relapse after stopping pantoprazole abruptly. Restarted, then tapered slowly over 4 weeks together with an early dinner (3 hours before bed) and head-end elevation. Stayed symptom free off daily medicine." },
  { date: "2026-05-19", context: "anonymised case outcome", text: "Case outcome: 50s male smoker with GERD and weight gain. Stopping late-night meals and cutting smoking reduced symptoms more than increasing the PPI dose." },

  // Fatigue and hair fall, first-visit workup
  { date: "2026-03-26", context: "anonymised case outcome", text: "Case outcome: 30s female with tiredness and hair fall for 3 months. Tests showed low ferritin and low vitamin D; thyroid normal. Iron and vitamin D supplements improved energy in 6 weeks." },
  { date: "2026-06-02", context: "anonymised case outcome", text: "Case outcome: 30s female with fatigue and hair fall; TSH high, diagnosed hypothyroidism. Thyroid replacement improved symptoms over 2 months." },
];
