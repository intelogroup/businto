const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function enrichOperators() {
  const { data: operators, error } = await supabase.from('operators').select('*');
  
  if (error) {
    console.error('Error fetching operators:', error);
    return;
  }

  console.log(`Enriching ${operators.length} operators...`);

  // Distribute conditions among operators
  const medicalOperators = operators.filter(op => op.specialties && op.specialties.includes('Medical Transport'));
  const schoolOperators = operators.filter(op => op.specialties && op.specialties.includes('School Routes'));

  // Medical conditions to distribute
  const medicalTags = [
    'White Glove', 
    'Door-Through-Door', 
    'Bariatric', 
    'Stretcher', 
    'Oxygen', 
    'Wheelchair', 
    'Service Animal'
  ];

  // School conditions to distribute
  const schoolTags = [
    'Special Needs', 
    'Booster Seat', 
    'No-Adult Release'
  ];

  let enrichedCount = 0;

  // 1. Give the first medical operator ALL tags (Super Operator for testing)
  if (medicalOperators.length > 0) {
    const superOp = medicalOperators[0];
    const newSpecialties = [...new Set([...(superOp.specialties || []), ...medicalTags])];
    
    await supabase.from('operators').update({ specialties: newSpecialties }).eq('id', superOp.id);
    console.log(`Made ${superOp.company_name} a Super Medical Operator with all tags.`);
    enrichedCount++;
  }

  // 2. Distribute 2-3 random tags to other medical operators
  for (let i = 1; i < medicalOperators.length; i++) {
    const op = medicalOperators[i];
    const numTags = Math.floor(Math.random() * 3) + 1; // 1 to 3 tags
    const shuffledTags = [...medicalTags].sort(() => 0.5 - Math.random());
    const selectedTags = shuffledTags.slice(0, numTags);
    
    const newSpecialties = [...new Set([...(op.specialties || []), ...selectedTags])];
    await supabase.from('operators').update({ specialties: newSpecialties }).eq('id', op.id);
    enrichedCount++;
  }

  // 3. Give the first school operator ALL school tags
  if (schoolOperators.length > 0) {
    const superOp = schoolOperators[0];
    const newSpecialties = [...new Set([...(superOp.specialties || []), ...schoolTags])];
    
    await supabase.from('operators').update({ specialties: newSpecialties }).eq('id', superOp.id);
    console.log(`Made ${superOp.company_name} a Super School Operator with all tags.`);
    enrichedCount++;
  }

  // 4. Distribute 1-2 random tags to other school operators
  for (let i = 1; i < schoolOperators.length; i++) {
    const op = schoolOperators[i];
    const numTags = Math.floor(Math.random() * 2) + 1; // 1 to 2 tags
    const shuffledTags = [...schoolTags].sort(() => 0.5 - Math.random());
    const selectedTags = shuffledTags.slice(0, numTags);
    
    const newSpecialties = [...new Set([...(op.specialties || []), ...selectedTags])];
    await supabase.from('operators').update({ specialties: newSpecialties }).eq('id', op.id);
    enrichedCount++;
  }

  console.log(`Successfully enriched ${enrichedCount} operators with condition tags.`);
}

enrichOperators();
