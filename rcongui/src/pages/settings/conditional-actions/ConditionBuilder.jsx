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
  { value: "PLAYER_NAME", label: "Player Name", type: "string" },
  { value: "PLAYER_ID", label: "Player ID", type: "string" },
  { value: "PLAYER_LEVEL", label: "Player Level", type: "number" },
  { value: "IS_VIP", label: "Is VIP", type: "boolean" },
  { value: "KILLS", label: "Kills (Session)", type: "number" },
  { value: "DEATHS", label: "Deaths (Session)", type: "number" },
  { value: "KILL_DEATH_RATIO", label: "K/D Ratio (Session)", type: "number" },
  { value: "TEAMKILLS", label: "Team Kills (Session)", type: "number" },
  { value: "COMBAT_SCORE", label: "Combat Score", type: "number" },
  { value: "OFFENSE_SCORE", label: "Offense Score", type: "number" },
  { value: "DEFENSE_SCORE", label: "Defense Score", type: "number" },
  { value: "SUPPORT_SCORE", label: "Support Score", type: "number" },
  { value: "KILLS_PER_MINUTE", label: "Kills Per Minute", type: "number" },
  { value: "DEATHS_PER_MINUTE", label: "Deaths Per Minute", type: "number" },
  { value: "KILL_STREAK", label: "Kill Streak", type: "number" },
  { value: "PLAYTIME_SECONDS", label: "Playtime (Session, seconds)", type: "number" },
  { value: "TOTAL_PLAYTIME_SECONDS", label: "Total Playtime (seconds)", type: "number" },
  { value: "SESSIONS_COUNT", label: "Total Sessions", type: "number" },
  { value: "PENALTY_COUNT", label: "Penalty Count", type: "number" },
  { value: "SERVER_PLAYER_COUNT", label: "Server Player Count", type: "number" },
  { value: "TEAM_PLAYER_COUNT", label: "Team Player Count", type: "number" },
  { value: "MAP_NAME", label: "Map Name", type: "string" },
  { value: "MATCH_TIME_REMAINING", label: "Match Time Remaining (seconds)", type: "number" },
];

const COMPARISON_OPERATORS = {
  string: [
    { value: "EQUAL", label: "Equals" },
    { value: "NOT_EQUAL", label: "Not Equals" },
    { value: "CONTAINS", label: "Contains" },
    { value: "NOT_CONTAINS", label: "Not Contains" },
    { value: "STARTS_WITH", label: "Starts With" },
    { value: "ENDS_WITH", label: "Ends With" },
    { value: "REGEX_MATCH", label: "Regex Match" },
  ],
  number: [
    { value: "EQUAL", label: "Equals (=)" },
    { value: "NOT_EQUAL", label: "Not Equals (≠)" },
    { value: "GREATER_THAN", label: "Greater Than (>)" },
    { value: "GREATER_THAN_OR_EQUAL", label: "Greater or Equal (≥)" },
    { value: "LESS_THAN", label: "Less Than (<)" },
    { value: "LESS_THAN_OR_EQUAL", label: "Less or Equal (≤)" },
  ],
  boolean: [
    { value: "EQUAL", label: "Equals" },
    { value: "NOT_EQUAL", label: "Not Equals" },
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

