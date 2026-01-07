import {
  Paper,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const CONDITION_FIELDS = [
  { value: "player_name", label: "Player Name", type: "string" },
  { value: "player_id", label: "Player ID", type: "string" },
  { value: "player_level", label: "Player Level", type: "number" },
  { value: "is_vip", label: "Is VIP", type: "boolean" },
  { value: "kills", label: "Kills (Session)", type: "number" },
  { value: "deaths", label: "Deaths (Session)", type: "number" },
  { value: "kill_death_ratio", label: "K/D Ratio (Session)", type: "number" },
  { value: "teamkills", label: "Team Kills (Session)", type: "number" },
  { value: "combat", label: "Combat Score", type: "number" },
  { value: "offense", label: "Offense Score", type: "number" },
  { value: "defense", label: "Defense Score", type: "number" },
  { value: "support", label: "Support Score", type: "number" },
  { value: "kills_per_minute", label: "Kills Per Minute", type: "number" },
  { value: "deaths_per_minute", label: "Deaths Per Minute", type: "number" },
  { value: "kills_streak", label: "Kill Streak", type: "number" },
  { value: "time_seconds", label: "Playtime (Session, seconds)", type: "number" },
  { value: "total_playtime_seconds", label: "Total Playtime (seconds)", type: "number" },
  { value: "sessions_count", label: "Total Sessions", type: "number" },
  { value: "penalty_count", label: "Penalty Count", type: "number" },
  { value: "server_player_count", label: "Server Player Count", type: "number" },
  { value: "team_player_count", label: "Team Player Count", type: "number" },
  { value: "map_name", label: "Map Name", type: "string" },
  { value: "match_time_remaining", label: "Match Time Remaining (seconds)", type: "number" },
];

const COMPARISON_OPERATORS = {
  string: [
    { value: "equal", label: "Equals" },
    { value: "not_equal", label: "Not Equals" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Not Contains" },
    { value: "starts_with", label: "Starts With" },
    { value: "ends_with", label: "Ends With" },
    { value: "regex_match", label: "Regex Match" },
  ],
  number: [
    { value: "equal", label: "Equals (=)" },
    { value: "not_equal", label: "Not Equals (≠)" },
    { value: "greater_than", label: "Greater Than (>)" },
    { value: "greater_than_or_equal", label: "Greater or Equal (≥)" },
    { value: "less_than", label: "Less Than (<)" },
    { value: "less_than_or_equal", label: "Less or Equal (≤)" },
  ],
  boolean: [
    { value: "equal", label: "Equals" },
    { value: "not_equal", label: "Not Equals" },
  ],
};

const ConditionBuilder = ({ condition, onChange, onDelete }) => {
  const selectedField = CONDITION_FIELDS.find((f) => f.value === condition.field);
  const fieldType = selectedField?.type || "string";
  const operators = COMPARISON_OPERATORS[fieldType] || COMPARISON_OPERATORS.string;

  const handleFieldChange = (event) => {
    const newField = event.target.value;
    const newFieldType = CONDITION_FIELDS.find((f) => f.value === newField)?.type || "string";
    
    // Reset operator if it's not valid for the new field type
    const validOperators = COMPARISON_OPERATORS[newFieldType] || COMPARISON_OPERATORS.string;
    const newOperator = validOperators.find((op) => op.value === condition.operator)
      ? condition.operator
      : validOperators[0].value;

    // Reset value based on type
    let newValue = "";
    if (newFieldType === "boolean") {
      newValue = true;
    } else if (newFieldType === "number") {
      newValue = 0;
    }

    onChange({
      ...condition,
      field: newField,
      operator: newOperator,
      value: newValue,
    });
  };

  const handleOperatorChange = (event) => {
    onChange({ ...condition, operator: event.target.value });
  };

  const handleValueChange = (event) => {
    let value = event.target.value;
    
    if (fieldType === "number") {
      value = parseFloat(value) || 0;
    } else if (fieldType === "boolean") {
      value = event.target.checked;
    }

    onChange({ ...condition, value });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Field</InputLabel>
          <Select value={condition.field} onChange={handleFieldChange} label="Field">
            {CONDITION_FIELDS.map((field) => (
              <MenuItem key={field.value} value={field.value}>
                {field.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel>Operator</InputLabel>
          <Select value={condition.operator} onChange={handleOperatorChange} label="Operator">
            {operators.map((op) => (
              <MenuItem key={op.value} value={op.value}>
                {op.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {fieldType === "boolean" ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={condition.value === true}
                onChange={handleValueChange}
              />
            }
            label="True"
          />
        ) : (
          <TextField
            label="Value"
            value={condition.value}
            onChange={handleValueChange}
            type={fieldType === "number" ? "number" : "text"}
            sx={{ flexGrow: 1 }}
          />
        )}

        <IconButton color="error" onClick={onDelete} size="small">
          <DeleteIcon />
        </IconButton>
      </Stack>
    </Paper>
  );
};

export default ConditionBuilder;

