import {
  Paper,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Typography,
  Box,
  Tooltip,
  Chip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const ACTION_TYPES = [
  {
    value: "message_player",
    label: "Message Player",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "message_all_players",
    label: "Message All Players",
    params: [{ name: "message", label: "Message", type: "text", required: true }],
  },
  {
    value: "kick_player",
    label: "Kick Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "punish_player",
    label: "Punish Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "temp_ban_player",
    label: "Temporary Ban Player",
    params: [
      { name: "reason", label: "Reason", type: "text", required: true },
      { name: "duration_hours", label: "Duration (hours)", type: "number", required: true, default: 2 },
    ],
  },
  {
    value: "perma_ban_player",
    label: "Permanent Ban Player",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "add_player_flag",
    label: "Add Player Flag",
    params: [
      { name: "flag", label: "Flag", type: "text", required: true },
      { name: "comment", label: "Comment", type: "text", required: false },
    ],
  },
  {
    value: "remove_player_flag",
    label: "Remove Player Flag",
    params: [{ name: "flag", label: "Flag", type: "text", required: true }],
  },
  {
    value: "add_to_watchlist",
    label: "Add to Watchlist",
    params: [{ name: "reason", label: "Reason", type: "text", required: true }],
  },
  {
    value: "broadcast_message",
    label: "Broadcast Message",
    params: [
      { name: "message", label: "Message", type: "text", required: true },
      { name: "duration_seconds", label: "Duration (seconds)", type: "number", required: false, default: 300 },
    ],
  },
  {
    value: "temporary_broadcast",
    label: "Temporary Broadcast",
    params: [
      { name: "message", label: "Message", type: "text", required: true },
      { name: "duration_seconds", label: "Duration (seconds)", type: "number", required: true, default: 60 },
    ],
  },
  {
    value: "send_discord_webhook",
    label: "Send Discord Webhook",
    params: [
      { name: "webhook_url", label: "Webhook URL", type: "text", required: true },
      { name: "message", label: "Message", type: "text", required: true },
    ],
  },
  {
    value: "switch_player_team",
    label: "Switch Player Team",
    params: [],
  },
  {
    value: "broadcast_match_summary",
    label: "Broadcast Match Summary (Leaderboard)",
    params: [
      { name: "top_count", label: "Top N Players Per Category", type: "number", required: false, default: 5 },
      { name: "categories", label: "Categories (comma-separated: kills,deaths,combat,offense,defense,support or 'all')", type: "text", required: false, default: "kills,support,combat,offense,defense" },
      { name: "header_message", label: "Header Message (shown before leaderboard)", type: "text", required: false },
      { name: "footer_message", label: "Footer Message (shown after leaderboard)", type: "text", required: false },
      { name: "label_kills", label: "Label: Kills Category", type: "text", required: false, default: "Top Kills" },
      { name: "label_deaths", label: "Label: Deaths Category", type: "text", required: false, default: "Most Deaths" },
      { name: "label_combat", label: "Label: Combat Category", type: "text", required: false, default: "Top Combat" },
      { name: "label_offense", label: "Label: Offense Category", type: "text", required: false, default: "Top Offense" },
      { name: "label_defense", label: "Label: Defense Category", type: "text", required: false, default: "Top Defense" },
      { name: "label_support", label: "Label: Support Category", type: "text", required: false, default: "Top Support" },
    ],
  },
  {
    value: "broadcast_role_leaderboard",
    label: "Broadcast Role Leaderboard (Best per Class)",
    params: [
      { name: "roles", label: "Roles (comma-separated or 'all')", type: "text", required: false, default: "officer,medic,engineer,sniper,tankcommander,antitank,assault" },
      { name: "header_message", label: "Header Message", type: "text", required: false },
      { name: "footer_message", label: "Footer Message", type: "text", required: false },
      { name: "label_officer", label: "Label: Officer", type: "text", required: false, default: "Best Officer" },
      { name: "label_medic", label: "Label: Medic", type: "text", required: false, default: "Best Medic" },
      { name: "label_engineer", label: "Label: Engineer", type: "text", required: false, default: "Best Engineer" },
      { name: "label_sniper", label: "Label: Sniper", type: "text", required: false, default: "Best Sniper" },
      { name: "label_tank", label: "Label: Tank Commander", type: "text", required: false, default: "Best Tank Commander" },
      { name: "label_antitank", label: "Label: Anti-Tank", type: "text", required: false, default: "Best Anti-Tank" },
      { name: "label_assault", label: "Label: Assault", type: "text", required: false, default: "Best Assault" },
      { name: "label_commander", label: "Label: Commander", type: "text", required: false, default: "Best Commander" },
    ],
  },
  {
    value: "broadcast_squad_leaderboard",
    label: "Broadcast Squad Leaderboard (Best Squads)",
    params: [
      { name: "top_count", label: "Top N Squads", type: "number", required: false, default: 3 },
      { name: "sort_by", label: "Sort by (kills, combat, support, offense, defense)", type: "text", required: false, default: "kills" },
      { name: "header_message", label: "Header Message", type: "text", required: false },
      { name: "footer_message", label: "Footer Message", type: "text", required: false },
    ],
  },
  {
    value: "broadcast_seasonal_leaderboard",
    label: "Broadcast Seasonal Leaderboard (Cross-Match)",
    params: [
      { name: "season_name", label: "Season Name", type: "text", required: false, default: "Season 1" },
      { name: "season_days", label: "Season Duration (days, 0 = no expiry)", type: "number", required: false, default: 30 },
      { name: "top_count", label: "Top N Players", type: "number", required: false, default: 10 },
      { name: "sort_by", label: "Sort by (kills, combat, support)", type: "text", required: false, default: "kills" },
      { name: "header_message", label: "Header Message", type: "text", required: false },
      { name: "footer_message", label: "Footer Message", type: "text", required: false },
    ],
  },
];

const ActionBuilder = ({ action, onChange, onDelete }) => {
  const selectedActionType = ACTION_TYPES.find((a) => a.value === action.action_type);
  const params = selectedActionType?.params || [];

  const handleActionTypeChange = (event) => {
    const newActionType = event.target.value;
    const newActionDef = ACTION_TYPES.find((a) => a.value === newActionType);
    
    const newParameters = {};
    newActionDef?.params.forEach((param) => {
      if (param.default !== undefined) {
        newParameters[param.name] = param.default;
      } else if (param.type === "number") {
        newParameters[param.name] = 0;
      } else {
        newParameters[param.name] = "";
      }
    });

    onChange({
      action_type: newActionType,
      parameters: newParameters,
    });
  };

  const handleParameterChange = (paramName) => (event) => {
    const value = event.target.type === "number" 
      ? parseFloat(event.target.value) || 0 
      : event.target.value;

    onChange({
      ...action,
      parameters: {
        ...action.parameters,
        [paramName]: value,
      },
    });
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        bgcolor: "background.default",
        '&:hover': {
          boxShadow: 2,
          borderColor: 'primary.main',
        },
        transition: 'all 0.2s',
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl sx={{ minWidth: 280 }} size="small">
            <InputLabel>Action Type</InputLabel>
            <Select
              value={action.action_type}
              onChange={handleActionTypeChange}
              label="Action Type"
            >
              {ACTION_TYPES.map((actionType) => (
                <MenuItem key={actionType.value} value={actionType.value}>
                  {actionType.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {params.length > 0 && (
            <Chip
              label={`${params.length} parameter${params.length > 1 ? 's' : ''}`}
              size="small"
              color="default"
              variant="outlined"
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Delete action">
            <IconButton
              color="error"
              onClick={onDelete}
              size="small"
              sx={{
                '&:hover': {
                  bgcolor: 'error.light',
                  color: 'error.contrastText',
                }
              }}
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        {params.length > 0 && (
          <Stack spacing={2} sx={{ pl: 1 }}>
            {params.map((param) => (
              <TextField
                key={param.name}
                label={param.label}
                value={action.parameters?.[param.name] ?? ""}
                onChange={handleParameterChange(param.name)}
                type={param.type === "number" ? "number" : "text"}
                required={param.required}
                fullWidth
                size="small"
                multiline={param.type === "text" && param.name === "message"}
                rows={param.type === "text" && param.name === "message" ? 3 : 1}
                helperText={
                  param.name === "message"
                    ? "You can use variables like {player_name}, {kills}, {deaths}, etc."
                    : undefined
                }
              />
            ))}
          </Stack>
        )}

        {params.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
            This action requires no additional parameters.
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

export default ActionBuilder;

