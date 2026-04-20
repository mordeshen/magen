const { getAdminSupabase } = require("../../pages/api/lib/supabase-admin");

const AVAILABLE_FIELDS = [
  "user.fullName",
  "user.idNumber",
  "user.phone",
  "user.email",
  "user.address",
  "user.city",
  "user.injuryType",
  "user.disabilityPercent",
  "user.injuryDate",
  "user.bankAccount",
];

class PIIResolver {
  constructor(profile, legalCase, injuries) {
    this.profile = profile || {};
    this.legalCase = legalCase || {};
    this.injuries = injuries || [];
  }

  static getAvailableFields() {
    return AVAILABLE_FIELDS;
  }

  resolve(valueRef) {
    const primaryInjury = this.injuries[0] || {};
    const map = {
      "user.fullName": this.profile.name || "",
      "user.idNumber": this.profile.id_number || "",
      "user.phone": this.profile.phone || "",
      "user.email": this.profile.email || "",
      "user.address": this.profile.address || "",
      "user.city": this.profile.city || "",
      "user.injuryType": primaryInjury.hebrew_label || primaryInjury.body_zone || "",
      "user.disabilityPercent": String(this.profile.disability_percent || ""),
      "user.injuryDate": primaryInjury.injury_date || this.legalCase.injury_date || "",
      "user.bankAccount": this.profile.bank_account || "",
    };
    return map[valueRef] ?? null;
  }

  resolveActions(actions) {
    return actions.map((action) => {
      let value;
      if (action.value_ref) {
        const resolved = this.resolve(action.value_ref);
        if (resolved === null) {
          throw new Error(`Unknown value_ref: ${action.value_ref}`);
        }
        value = resolved;
      } else if (action.literal_value) {
        value = action.literal_value;
      }
      return {
        type: action.type,
        selector: action.selector,
        value,
        description: action.description,
      };
    });
  }
}

async function loadUserProfile(userId) {
  const supabase = getAdminSupabase();

  const [profileRes, legalRes, injuriesRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("legal_cases").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("injuries").select("*").eq("user_id", userId),
  ]);

  return new PIIResolver(
    profileRes.data,
    legalRes.data,
    injuriesRes.data || []
  );
}

module.exports = { PIIResolver, loadUserProfile, AVAILABLE_FIELDS };
